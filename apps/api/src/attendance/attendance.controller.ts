import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { DATE_RE, MONTH_RE, ZodPipe, audit, isoDate, monthBounds, toDate, todayIst } from "../common/http";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles, isHr, ownEmployeeId } from "../auth/decorators";

const CheckIn = z.object({ workFromHome: z.boolean().default(false) });
const Mark = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  status: z.enum(["PRESENT", "WFH", "ABSENT"]),
});
const MonthQuery = z.object({ month: z.string().regex(MONTH_RE, "Use YYYY-MM"), employeeId: z.string().uuid().optional() });

@Controller("attendance")
export class AttendanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("check-in")
  @HttpCode(200)
  checkIn(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CheckIn)) body: z.infer<typeof CheckIn>) {
    const employeeId = ownEmployeeId(user);
    const date = toDate(todayIst());
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const existing = await tx.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date } } });
      if (existing?.status === "LEAVE") throw new ConflictException("You're on approved leave today");
      if (existing?.checkIn) return existing;
      const status = body.workFromHome ? "WFH" : "PRESENT";
      return tx.attendanceDay.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: { companyId: user.companyId, employeeId, date, status, checkIn: new Date() },
        update: { status, checkIn: new Date() },
      });
    });
  }

  @Post("check-out")
  @HttpCode(200)
  checkOut(@CurrentUser() user: AuthUser) {
    const employeeId = ownEmployeeId(user);
    const date = toDate(todayIst());
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const day = await tx.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date } } });
      if (!day?.checkIn) throw new ConflictException("Check in before checking out");
      return tx.attendanceDay.update({ where: { id: day.id }, data: { checkOut: new Date() } });
    });
  }

  /** HR corrects a day. Absences become loss of pay in that month's payroll. */
  @Put()
  @Roles("OWNER", "HR")
  mark(@CurrentUser() user: AuthUser, @Body(new ZodPipe(Mark)) body: z.infer<typeof Mark>) {
    const date = toDate(body.date);
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { companyId_month: { companyId: user.companyId, month: body.date.slice(0, 7) } } });
      if (run?.status === "LOCKED") throw new ConflictException(`Payroll for ${run.month} is locked, so its attendance can't change`);
      // Foreign keys ignore row-level security, so confirm the employee is visible to this company.
      if (!(await tx.employee.findUnique({ where: { id: body.employeeId }, select: { id: true } }))) {
        throw new NotFoundException("Employee not found");
      }
      const day = await tx.attendanceDay.upsert({
        where: { employeeId_date: { employeeId: body.employeeId, date } },
        create: { companyId: user.companyId, employeeId: body.employeeId, date, status: body.status },
        update: { status: body.status },
      });
      await audit(tx, user, "attendance.mark", "attendance_day", day.id, body);
      return day;
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(MonthQuery)) q: z.infer<typeof MonthQuery>) {
    const employeeId = isHr(user) ? q.employeeId : ownEmployeeId(user);
    if (!isHr(user) && q.employeeId && q.employeeId !== employeeId) throw new ForbiddenException("You can only see your own attendance");
    const { start, end } = monthBounds(q.month);
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const days = await tx.attendanceDay.findMany({
        where: { employeeId, date: { gte: start, lte: end } },
        orderBy: [{ employeeId: "asc" }, { date: "asc" }],
      });
      return days.map((d) => ({ ...d, date: isoDate(d.date) }));
    });
  }
}
