import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { LeaveType } from "@prisma/client";
import { z } from "zod";
import { PrismaService, Tx } from "../prisma.service";
import { DATE_RE, ZodPipe, audit, isoDate, toDate, todayIst, workingDays } from "../common/http";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser, isHr, ownEmployeeId } from "../auth/decorators";

const Apply = z
  .object({
    type: z.enum(["CL", "SL", "EL"]),
    fromDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
    toDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
    reason: z.string().trim().min(1, "Add a short reason for your manager"),
  })
  .refine((b) => b.fromDate <= b.toDate, { message: "Start date must be on or before the end date", path: ["toDate"] });
const ListQuery = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]).optional() });
const Decision = z.object({ approve: z.boolean() });

type Balances = Record<LeaveType, { quota: number; used: number; pending: number; available: number }>;

async function balances(tx: Tx, companyId: string, employeeId: string, year: string): Promise<Balances> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const policy = company.leavePolicy as Record<LeaveType, number>;
  const rows = await tx.leaveRequest.findMany({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
  });
  const out = {} as Balances;
  for (const type of ["CL", "SL", "EL"] as LeaveType[]) {
    const used = rows.filter((r) => r.type === type && r.status === "APPROVED").reduce((a, r) => a + r.days, 0);
    const pending = rows.filter((r) => r.type === type && r.status === "PENDING").reduce((a, r) => a + r.days, 0);
    out[type] = { quota: policy[type] ?? 0, used, pending, available: (policy[type] ?? 0) - used - pending };
  }
  return out;
}

const shape = <T extends { fromDate: Date; toDate: Date }>(l: T) => ({ ...l, fromDate: isoDate(l.fromDate), toDate: isoDate(l.toDate) });

@Controller()
export class LeaveController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("leave-balances/me")
  myBalances(@CurrentUser() user: AuthUser) {
    const employeeId = ownEmployeeId(user);
    return this.prisma.forCompany(user.companyId, (tx) => balances(tx, user.companyId, employeeId, todayIst().slice(0, 4)));
  }

  @Post("leave-requests")
  apply(@CurrentUser() user: AuthUser, @Body(new ZodPipe(Apply)) body: z.infer<typeof Apply>) {
    const employeeId = ownEmployeeId(user);
    if (body.fromDate < todayIst()) throw new BadRequestException("Leave can't start in the past. Ask HR to record past absences.");
    if (body.fromDate.slice(0, 4) !== body.toDate.slice(0, 4)) throw new BadRequestException("Split leave that crosses the new year into two requests");
    const days = workingDays(body.fromDate, body.toDate);
    if (!days.length) throw new BadRequestException("Those dates fall on weekends only");
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const bal = await balances(tx, user.companyId, employeeId, body.fromDate.slice(0, 4));
      if (days.length > bal[body.type].available) {
        throw new BadRequestException(`Only ${bal[body.type].available} days of this leave type are available`);
      }
      const overlap = await tx.leaveRequest.findFirst({
        where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: toDate(body.toDate) }, toDate: { gte: toDate(body.fromDate) } },
      });
      if (overlap) throw new ConflictException("These dates overlap another leave request");
      const req = await tx.leaveRequest.create({
        data: {
          companyId: user.companyId,
          employeeId,
          type: body.type,
          fromDate: toDate(body.fromDate),
          toDate: toDate(body.toDate),
          days: days.length,
          reason: body.reason,
        },
      });
      return shape(req);
    });
  }

  @Get("leave-requests")
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      // HR sees everyone; others see their own requests and those of people who report to them.
      const scope = isHr(user)
        ? {}
        : { OR: [{ employeeId: ownEmployeeId(user) }, { employee: { managerId: ownEmployeeId(user) } }] };
      const rows = await tx.leaveRequest.findMany({
        where: { status: q.status, ...scope },
        include: { employee: { select: { id: true, code: true, name: true, designation: true } } },
        orderBy: { fromDate: "asc" },
        take: 500,
      });
      return rows.map(shape);
    });
  }

  @Post("leave-requests/:id/decision")
  @HttpCode(200)
  decide(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodPipe(Decision)) body: z.infer<typeof Decision>) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const req = await tx.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
      if (!req) throw new NotFoundException("Leave request not found");
      const isManager = user.employeeId !== null && req.employee.managerId === user.employeeId;
      if (!isHr(user) && !isManager) throw new ForbiddenException("Only HR or the employee's manager can decide this request");
      if (req.employeeId === user.employeeId) throw new ForbiddenException("You can't approve your own leave");
      if (req.status !== "PENDING") throw new ConflictException(`This request is already ${req.status.toLowerCase()}`);

      const status = body.approve ? "APPROVED" : "REJECTED";
      const updated = await tx.leaveRequest.update({ where: { id }, data: { status, decidedById: user.sub, decidedAt: new Date() } });
      if (body.approve) {
        for (const d of workingDays(isoDate(req.fromDate), isoDate(req.toDate))) {
          await tx.attendanceDay.upsert({
            where: { employeeId_date: { employeeId: req.employeeId, date: toDate(d) } },
            create: { companyId: user.companyId, employeeId: req.employeeId, date: toDate(d), status: "LEAVE" },
            update: { status: "LEAVE" },
          });
        }
      }
      await audit(tx, user, `leave.${status.toLowerCase()}`, "leave_request", id);
      return shape(updated);
    });
  }

  @Post("leave-requests/:id/withdraw")
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    const employeeId = ownEmployeeId(user);
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const req = await tx.leaveRequest.findUnique({ where: { id } });
      if (!req || req.employeeId !== employeeId) throw new NotFoundException("Leave request not found");
      if (req.status !== "PENDING") throw new ConflictException("Only pending requests can be withdrawn");
      return shape(await tx.leaveRequest.update({ where: { id }, data: { status: "WITHDRAWN" } }));
    });
  }
}
