/**
 * Statutory rates, stored with the date they take effect so that any past
 * payroll can be recomputed exactly. A change in a state budget is a new entry
 * here (later: a row in the database), never an edit to an old one.
 *
 * Every figure must be confirmed by a payroll consultant before go-live.
 */

export type StateCode = "TS" | "AP" | "KA";

export interface PtSlab {
  /** Monthly gross at or above which this slab applies (rupees). */
  from: number;
  /** Monthly deduction (rupees). */
  amount: number;
  /** Optional override for one calendar month (1-12), e.g. Karnataka's February. */
  monthOverride?: { month: number; amount: number };
}

export interface PtRule {
  effectiveFrom: string; // YYYY-MM-DD
  slabs: PtSlab[]; // ascending by `from`
  /** Day of the following month by which the return and payment are due. */
  dueDay: number;
}

export interface TaxSlab {
  upTo: number; // annual taxable income, rupees; Infinity for the top slab
  rate: number;
}

export interface TaxRule {
  effectiveFrom: string;
  standardDeduction: number;
  slabs: TaxSlab[];
  /** Section 87A: no tax when taxable income is at or below this, with marginal relief above it. */
  rebateLimit: number;
  cess: number;
}

export interface PfRule {
  effectiveFrom: string;
  wageCeiling: number;
  employeeRate: number;
  employerRate: number; // total employer share, split into EPS and EPF
  epsRate: number;
}

export interface EsiRule {
  effectiveFrom: string;
  grossLimit: number;
  employeeRate: number;
  employerRate: number;
}

export const PT_RULES: Record<StateCode, PtRule[]> = {
  TS: [
    {
      effectiveFrom: "2013-04-01",
      dueDay: 10,
      slabs: [
        { from: 0, amount: 0 },
        { from: 15001, amount: 150 },
        { from: 20001, amount: 200 },
      ],
    },
  ],
  AP: [
    {
      effectiveFrom: "2013-04-01",
      dueDay: 10,
      slabs: [
        { from: 0, amount: 0 },
        { from: 15001, amount: 150 },
        { from: 20001, amount: 200 },
      ],
    },
  ],
  KA: [
    {
      effectiveFrom: "2025-04-01",
      dueDay: 20,
      slabs: [
        { from: 0, amount: 0 },
        { from: 25000, amount: 200, monthOverride: { month: 2, amount: 300 } },
      ],
    },
  ],
};

export const TAX_RULES: TaxRule[] = [
  {
    // New regime from FY 2025-26 (Finance Act 2025)
    effectiveFrom: "2025-04-01",
    standardDeduction: 75000,
    slabs: [
      { upTo: 400000, rate: 0 },
      { upTo: 800000, rate: 0.05 },
      { upTo: 1200000, rate: 0.1 },
      { upTo: 1600000, rate: 0.15 },
      { upTo: 2000000, rate: 0.2 },
      { upTo: 2400000, rate: 0.25 },
      { upTo: Infinity, rate: 0.3 },
    ],
    rebateLimit: 1200000,
    cess: 0.04,
  },
];

export const PF_RULES: PfRule[] = [
  { effectiveFrom: "2014-09-01", wageCeiling: 15000, employeeRate: 0.12, employerRate: 0.12, epsRate: 0.0833 },
];

export const ESI_RULES: EsiRule[] = [
  { effectiveFrom: "2019-07-01", grossLimit: 21000, employeeRate: 0.0075, employerRate: 0.0325 },
];

/** Picks the latest rule that is in force on `date` (YYYY-MM-DD). */
export function inForce<T extends { effectiveFrom: string }>(rules: T[], date: string): T {
  const match = [...rules]
    .filter((r) => r.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!match) throw new Error(`No statutory rule in force on ${date}`);
  return match;
}

export const STATE_NAMES: Record<StateCode, string> = {
  TS: "Telangana",
  AP: "Andhra Pradesh",
  KA: "Karnataka",
};
