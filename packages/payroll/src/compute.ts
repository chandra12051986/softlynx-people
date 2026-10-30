import { ESI_RULES, PF_RULES, PT_RULES, StateCode, TAX_RULES, inForce } from "./rules";

export interface SalaryPolicy {
  /** Basic as a percentage of monthly gross. */
  basicPct: number;
  /** HRA as a percentage of basic (40 for non-metro cities, 50 for metros). */
  hraPct: number;
}

export const DEFAULT_POLICY: SalaryPolicy = { basicPct: 50, hraPct: 40 };

export interface SalaryStructure {
  gross: number;
  basic: number;
  hra: number;
  special: number;
  employerPf: number;
}

/**
 * Splits an annual CTC into a monthly structure. CTC includes the employer's
 * PF share, so gross is what remains after it.
 */
export function salaryStructure(annualCtc: number, policy: SalaryPolicy = DEFAULT_POLICY, onDate = "2026-04-01"): SalaryStructure {
  const pf = inForce(PF_RULES, onDate);
  const monthly = annualCtc / 12;
  const bp = policy.basicPct / 100;
  const cappedEmployerPf = pf.wageCeiling * pf.employerRate;
  let gross = monthly - cappedEmployerPf;
  // Below the wage ceiling the employer pays 12% of basic, so solve for gross.
  if (gross * bp < pf.wageCeiling) gross = monthly / (1 + pf.employerRate * bp);
  gross = Math.round(gross);
  const basic = Math.round(gross * bp);
  const hra = Math.round((basic * policy.hraPct) / 100);
  return {
    gross,
    basic,
    hra,
    special: gross - basic - hra,
    employerPf: Math.round(Math.min(basic, pf.wageCeiling) * pf.employerRate),
  };
}

export function professionalTax(state: StateCode, monthlyGross: number, month: string): number {
  const rule = inForce(PT_RULES[state], `${month}-01`);
  const m = Number(month.slice(5, 7));
  let amount = 0;
  for (const slab of rule.slabs) {
    if (monthlyGross >= slab.from) amount = slab.monthOverride?.month === m ? slab.monthOverride.amount : slab.amount;
  }
  return monthlyGross > 0 ? amount : 0;
}

/** Annual income tax under the new regime, including Sec 87A rebate, marginal relief and cess. */
export function annualTaxNewRegime(annualGross: number, fyStart = "2026-04-01"): number {
  const rule = inForce(TAX_RULES, fyStart);
  const taxable = Math.max(0, annualGross - rule.standardDeduction);
  let tax = 0;
  let prev = 0;
  for (const slab of rule.slabs) {
    if (taxable > prev) tax += (Math.min(taxable, slab.upTo) - prev) * slab.rate;
    prev = slab.upTo;
  }
  tax = taxable <= rule.rebateLimit ? 0 : Math.min(tax, taxable - rule.rebateLimit);
  return Math.round(tax * (1 + rule.cess));
}

export interface PayslipInput {
  annualCtc: number;
  state: StateCode;
  /** Payroll month, YYYY-MM. */
  month: string;
  /** Unpaid absences in the month. */
  lopDays?: number;
  /** Date of joining, YYYY-MM-DD; days before it are not paid. */
  dateOfJoining?: string;
  policy?: SalaryPolicy;
  /**
   * TDS spread. Defaults assume tax was deducted evenly in earlier months of
   * the financial year; pass real figures once year-to-date data exists.
   */
  tds?: { projectedAnnualGross?: number; deductedSoFar?: number };
}

export interface Payslip {
  month: string;
  daysInMonth: number;
  paidDays: number;
  lopDays: number;
  unpaidBeforeJoining: number;
  earnings: { basic: number; hra: number; special: number; gross: number };
  deductions: { pf: number; esi: number; pt: number; tds: number; total: number };
  employer: { epf: number; eps: number; esi: number };
  netPay: number;
  costToCompany: number;
  esiCovered: boolean;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Months of the financial year (April to March) from `month` to March, inclusive. */
export function monthsLeftInFy(month: string): number {
  const m = Number(month.slice(5, 7));
  return m >= 4 ? 12 - (m - 4) : 4 - m;
}

function fyStartOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

export function computePayslip(input: PayslipInput): Payslip {
  const { annualCtc, state, month } = input;
  const policy = input.policy ?? DEFAULT_POLICY;
  const onDate = `${month}-01`;
  const pf = inForce(PF_RULES, onDate);
  const esi = inForce(ESI_RULES, onDate);
  const st = salaryStructure(annualCtc, policy, onDate);

  const days = daysInMonth(month);
  const joinDay = input.dateOfJoining && input.dateOfJoining.slice(0, 7) === month ? Number(input.dateOfJoining.slice(8, 10)) : 1;
  const unpaidBeforeJoining = input.dateOfJoining && input.dateOfJoining.slice(0, 7) > month ? days : joinDay - 1;
  const lopDays = input.lopDays ?? 0;
  const paidDays = Math.max(0, days - unpaidBeforeJoining - lopDays);
  const f = paidDays / days;

  const basic = Math.round(st.basic * f);
  const hra = Math.round(st.hra * f);
  const special = Math.round(st.special * f);
  const gross = basic + hra + special;

  const pfWage = Math.min(basic, pf.wageCeiling);
  const eePf = Math.round(pfWage * pf.employeeRate);
  const eps = Math.round(pfWage * pf.epsRate);
  const epf = Math.round(pfWage * pf.employerRate) - eps;

  // ESI coverage follows the contracted gross; contributions are rounded up to the next rupee.
  const esiCovered = st.gross <= esi.grossLimit;
  const eeEsi = esiCovered ? Math.ceil(gross * esi.employeeRate) : 0;
  const erEsi = esiCovered ? Math.ceil(gross * esi.employerRate) : 0;

  const pt = professionalTax(state, gross, month);

  const fyStart = fyStartOf(month);
  const projected = input.tds?.projectedAnnualGross ?? st.gross * 12;
  const annualTax = annualTaxNewRegime(projected, fyStart);
  const left = monthsLeftInFy(month);
  const deductedSoFar = input.tds?.deductedSoFar ?? Math.round((annualTax * (12 - left)) / 12);
  const tds = paidDays === 0 ? 0 : Math.max(0, Math.round((annualTax - deductedSoFar) / left));

  const total = eePf + eeEsi + pt + tds;
  return {
    month,
    daysInMonth: days,
    paidDays,
    lopDays,
    unpaidBeforeJoining,
    earnings: { basic, hra, special, gross },
    deductions: { pf: eePf, esi: eeEsi, pt, tds, total },
    employer: { epf, eps, esi: erEsi },
    netPay: gross - total,
    costToCompany: gross + epf + eps + erEsi,
    esiCovered,
  };
}
