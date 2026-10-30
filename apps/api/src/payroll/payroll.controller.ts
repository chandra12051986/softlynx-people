import { Body, ConflictException, Controller, Get, Header, HttpCode, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Payslip, StateCode, amountInWords, computePayslip } from "@softlynx/payroll";
import { z } from "zod";
import { PrismaService, Tx } from "../prisma.service";
import { MONTH_RE, ZodPipe, audit, isoDate, monthBounds } from "../common/http";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles, ownEmployeeId } from "../auth/decorators";

const RunBody = z.object({ month: z.string().regex(MONTH_RE, "Use YYYY-MM") });
const MonthParam = z.string().regex(MONTH_RE, "Use YYYY-MM");
const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

async function findRun(tx: Tx, companyId: string, month: string) {
  const run = await tx.payrollRun.findUnique({ where: { companyId_month: { companyId, month } } });
  if (!run) throw new NotFoundException(`No payroll has been run for ${month}`);
  return run;
}

@Controller()
export class PayrollController {
  constructor(private readonly prisma: PrismaService) {}

  /** Computes (or recomputes) the draft payroll for a month from employees and attendance. */
  @Post("payroll/runs")
  @Roles("OWNER", "HR")
  run(@CurrentUser() user: AuthUser, @Body(new ZodPipe(RunBody)) body: z.infer<typeof RunBody>) {
    const { month } = body;
    const { start, end } = monthBounds(month);
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const existing = await tx.payrollRun.findUnique({ where: { companyId_month: { companyId: user.companyId, month } } });
      if (existing?.status === "LOCKED") throw new ConflictException(`Payroll for ${month} is locked`);

      const company = await tx.company.findUniqueOrThrow({ where: { id: user.companyId } });
      const employees = await tx.employee.findMany({ where: { status: { not: "EXITED" }, dateOfJoining: { lte: end } } });
      const absences = await tx.attendanceDay.groupBy({
        by: ["employeeId"],
        where: { status: "ABSENT", date: { gte: start, lte: end } },
        _count: { _all: true },
      });
      const lop = new Map(absences.map((a) => [a.employeeId, a._count._all]));

      const run = existing
        ? await tx.payrollRun.update({ where: { id: existing.id }, data: { computedAt: new Date() } })
        : await tx.payrollRun.create({ data: { companyId: user.companyId, month } });
      await tx.payslip.deleteMany({ where: { runId: run.id } });
      await tx.payslip.createMany({
        data: employees.map((e) => {
          const slip = computePayslip({
            annualCtc: e.annualCtc,
            state: e.state as StateCode,
            month,
            lopDays: lop.get(e.id) ?? 0,
            dateOfJoining: isoDate(e.dateOfJoining),
            policy: { basicPct: company.basicPct, hraPct: company.hraPct },
          });
          return {
            companyId: user.companyId,
            runId: run.id,
            employeeId: e.id,
            month,
            netPay: slip.netPay,
            breakdown: slip as unknown as Prisma.InputJsonValue,
          };
        }),
      });
      await audit(tx, user, "payroll.compute", "payroll_run", run.id, { month, employees: employees.length });
      return this.summary(tx, user.companyId, month);
    });
  }

  @Get("payroll/runs/:month")
  @Roles("OWNER", "HR")
  get(@CurrentUser() user: AuthUser, @Param("month", new ZodPipe(MonthParam)) month: string, @Query(new ZodPipe(PageQuery)) q: z.infer<typeof PageQuery>) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const summary = await this.summary(tx, user.companyId, month);
      const payslips = await tx.payslip.findMany({
        where: { runId: summary.run.id },
        include: { employee: { select: { code: true, name: true, designation: true, state: true } } },
        orderBy: { employee: { code: "asc" } },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
      return {
        ...summary,
        payslips: payslips.map((s) => ({ ...s, netPayInWords: `Rupees ${amountInWords(s.netPay)} only` })),
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }

  /** Freezes the month: figures can no longer change and payslips become visible to employees. */
  @Post("payroll/runs/:month/lock")
  @Roles("OWNER", "HR")
  @HttpCode(200)
  lock(@CurrentUser() user: AuthUser, @Param("month", new ZodPipe(MonthParam)) month: string) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const run = await findRun(tx, user.companyId, month);
      if (run.status === "LOCKED") throw new ConflictException(`Payroll for ${month} is already locked`);
      const locked = await tx.payrollRun.update({ where: { id: run.id }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: user.sub } });
      await audit(tx, user, "payroll.lock", "payroll_run", run.id, { month });
      return locked;
    });
  }

  /** Salary transfer file for the bank, one row per employee. */
  @Get("payroll/runs/:month/bank-file")
  @Roles("OWNER", "HR")
  @Header("Content-Type", "text/csv; charset=utf-8")
  bankFile(@CurrentUser() user: AuthUser, @Param("month", new ZodPipe(MonthParam)) month: string) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const run = await findRun(tx, user.companyId, month);
      const slips = await tx.payslip.findMany({
        where: { runId: run.id, netPay: { gt: 0 } },
        include: { employee: { select: { code: true, name: true, bankAccount: true, ifsc: true } } },
        orderBy: { employee: { code: "asc" } },
      });
      const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = slips.map((s) =>
        [s.employee.code, s.employee.name, s.employee.bankAccount, s.employee.ifsc, s.netPay, `Salary ${month}`].map(cell).join(","),
      );
      return ["Employee code,Name,Account number,IFSC,Amount,Narration", ...lines].join("\n") + "\n";
    });
  }

  /** The signed-in employee's payslips from locked months. */
  @Get("payslips/me")
  mine(@CurrentUser() user: AuthUser) {
    const employeeId = ownEmployeeId(user);
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const slips = await tx.payslip.findMany({ where: { employeeId, run: { status: "LOCKED" } }, orderBy: { month: "desc" } });
      return slips.map((s) => ({ ...s, netPayInWords: `Rupees ${amountInWords(s.netPay)} only` }));
    });
  }

  private async summary(tx: Tx, companyId: string, month: string) {
    const run = await findRun(tx, companyId, month);
    const slips = await tx.payslip.findMany({ where: { runId: run.id }, include: { employee: { select: { state: true } } } });
    const t = { employees: slips.length, gross: 0, deductions: 0, net: 0, cost: 0, pfEmployee: 0, pfEmployer: 0, esiEmployee: 0, esiEmployer: 0, tds: 0 };
    const pt: Record<string, number> = {};
    for (const s of slips) {
      const b = s.breakdown as unknown as Payslip;
      t.gross += b.earnings.gross;
      t.deductions += b.deductions.total;
      t.net += b.netPay;
      t.cost += b.costToCompany;
      t.pfEmployee += b.deductions.pf;
      t.pfEmployer += b.employer.epf + b.employer.eps;
      t.esiEmployee += b.deductions.esi;
      t.esiEmployer += b.employer.esi;
      t.tds += b.deductions.tds;
      pt[s.employee.state] = (pt[s.employee.state] ?? 0) + b.deductions.pt;
    }
    return { run, totals: { ...t, professionalTaxByState: pt } };
  }
}
