import { describe, expect, it } from "vitest";
import { amountInWords, annualTaxNewRegime, computePayslip, monthsLeftInFy, professionalTax, salaryStructure } from "../src";

describe("salaryStructure", () => {
  it("caps employer PF at 12% of ₹15,000 for higher salaries", () => {
    const s = salaryStructure(3200000);
    expect(s.gross).toBe(264867);
    expect(s.employerPf).toBe(1800);
    expect(s.basic + s.hra + s.special).toBe(s.gross);
  });

  it("solves gross when basic is below the PF wage ceiling", () => {
    const s = salaryStructure(240000);
    expect(s.gross).toBe(18868);
    expect(s.basic).toBe(9434);
    expect(s.employerPf).toBe(1132);
  });
});

describe("professionalTax", () => {
  it("applies the Telangana and Andhra Pradesh slabs", () => {
    for (const st of ["TS", "AP"] as const) {
      expect(professionalTax(st, 15000, "2026-10")).toBe(0);
      expect(professionalTax(st, 15001, "2026-10")).toBe(150);
      expect(professionalTax(st, 20000, "2026-10")).toBe(150);
      expect(professionalTax(st, 20001, "2026-10")).toBe(200);
    }
  });

  it("applies Karnataka's ₹25,000 threshold and February ₹300", () => {
    expect(professionalTax("KA", 24999, "2026-10")).toBe(0);
    expect(professionalTax("KA", 25000, "2026-10")).toBe(200);
    expect(professionalTax("KA", 25000, "2027-02")).toBe(300);
    expect(professionalTax("KA", 24999, "2027-02")).toBe(0);
  });

  it("is zero when nothing is earned", () => {
    expect(professionalTax("TS", 0, "2026-10")).toBe(0);
  });
});

describe("annualTaxNewRegime", () => {
  it("is nil up to ₹12 lakh taxable income (Sec 87A)", () => {
    expect(annualTaxNewRegime(1275000)).toBe(0);
  });

  it("applies marginal relief just above ₹12 lakh", () => {
    // taxable 12,10,000: slab tax 61,500 is capped at the 10,000 excess, plus 4% cess
    expect(annualTaxNewRegime(1285000)).toBe(10400);
  });

  it("taxes high incomes across all slabs with cess", () => {
    // taxable 31,03,400 -> 5,11,020 before cess
    expect(annualTaxNewRegime(3178400)).toBe(531461);
  });
});

describe("computePayslip", () => {
  it("computes a senior employee in Telangana", () => {
    const p = computePayslip({ annualCtc: 3200000, state: "TS", month: "2026-09" });
    expect(p.earnings.gross).toBe(264867);
    expect(p.deductions).toMatchObject({ pf: 1800, esi: 0, pt: 200, tds: 44288 });
    expect(p.netPay).toBe(218579);
    expect(p.employer).toEqual({ epf: 550, eps: 1250, esi: 0 });
  });

  it("covers ESI for gross up to ₹21,000 and rounds contributions up", () => {
    const p = computePayslip({ annualCtc: 240000, state: "TS", month: "2026-09" });
    expect(p.esiCovered).toBe(true);
    expect(p.deductions).toMatchObject({ pf: 1132, esi: 142, pt: 150, tds: 0 });
    expect(p.employer.esi).toBe(614);
    expect(p.netPay).toBe(17444);
  });

  it("deducts loss of pay days", () => {
    const p = computePayslip({ annualCtc: 600000, state: "AP", month: "2026-09", lopDays: 3 });
    expect(p.paidDays).toBe(27);
    const full = computePayslip({ annualCtc: 600000, state: "AP", month: "2026-09" });
    expect(p.earnings.gross).toBeLessThan(full.earnings.gross);
    expect(p.earnings.gross).toBeCloseTo((full.earnings.gross * 27) / 30, -1);
  });

  it("prorates a mid-month joiner", () => {
    const p = computePayslip({ annualCtc: 600000, state: "KA", month: "2026-10", dateOfJoining: "2026-10-16" });
    expect(p.unpaidBeforeJoining).toBe(15);
    expect(p.paidDays).toBe(16);
  });

  it("pays nothing before the joining month", () => {
    const p = computePayslip({ annualCtc: 600000, state: "KA", month: "2026-10", dateOfJoining: "2026-11-02" });
    expect(p.paidDays).toBe(0);
    expect(p.netPay).toBe(0);
  });

  it("spreads remaining tax over the rest of the financial year", () => {
    const p = computePayslip({
      annualCtc: 3200000,
      state: "TS",
      month: "2027-01",
      tds: { deductedSoFar: 300000 },
    });
    // January to March = 3 months left; (5,31,461 - 3,00,000) / 3
    expect(p.deductions.tds).toBe(77154);
  });
});

describe("helpers", () => {
  it("counts months left in the financial year", () => {
    expect(monthsLeftInFy("2026-04")).toBe(12);
    expect(monthsLeftInFy("2026-10")).toBe(6);
    expect(monthsLeftInFy("2027-03")).toBe(1);
  });

  it("writes amounts in Indian words", () => {
    expect(amountInWords(56200)).toBe("Fifty Six Thousand Two Hundred");
    expect(amountInWords(218578)).toBe("Two Lakh Eighteen Thousand Five Hundred Seventy Eight");
    expect(amountInWords(31069964)).toBe("Three Crore Ten Lakh Sixty Nine Thousand Nine Hundred Sixty Four");
  });
});
