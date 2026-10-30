import { Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { salaryStructure } from "@softlynx/payroll";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { DATE_RE, ZodPipe, audit, toDate } from "../common/http";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles, isHr } from "../auth/decorators";

/** Work locations offered today; each decides which state's Professional Tax applies. */
export const CITIES = { Hyderabad: "TS", Visakhapatnam: "AP", Vijayawada: "AP", Bengaluru: "KA" } as const;

const ListQuery = z.object({
  q: z.string().trim().optional(),
  state: z.enum(["TS", "AP", "KA"]).optional(),
  department: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

const CreateEmployee = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().min(1),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  designation: z.string().trim().min(1),
  department: z.string().trim().min(1),
  city: z.enum(Object.keys(CITIES) as [keyof typeof CITIES]),
  dateOfJoining: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  annualCtc: z.number().int().min(120000, "Annual CTC must be at least ₹1,20,000"),
  pan: z.string().toUpperCase().pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN should look like ABCDE1234F")),
  uan: z.string().regex(/^\d{12}$/, "UAN is 12 digits").optional(),
  bankAccount: z.string().regex(/^\d{9,18}$/, "Bank account should be 9 to 18 digits").optional(),
  ifsc: z.string().toUpperCase().pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC should look like HDFC0001234")).optional(),
  managerId: z.string().uuid().optional(),
});

/** Bank account numbers are shown masked everywhere except the bank transfer file. */
const mask = (acct: string | null) => (acct ? `XXXX${acct.slice(-4)}` : null);

@Controller("employees")
export class EmployeesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles("OWNER", "HR")
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    const where: Prisma.EmployeeWhereInput = {
      state: q.state,
      department: q.department,
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: "insensitive" } },
          { code: { contains: q.q, mode: "insensitive" } },
          { designation: { contains: q.q, mode: "insensitive" } },
          { city: { contains: q.q, mode: "insensitive" } },
        ],
      }),
    };
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.employee.findMany({ where, orderBy: { code: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
        tx.employee.count({ where }),
      ]);
      return { items: items.map((e) => ({ ...e, bankAccount: mask(e.bankAccount) })), total, page: q.page, pageSize: q.pageSize };
    });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    if (!isHr(user) && user.employeeId !== id) throw new ForbiddenException("You can only view your own profile");
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const [e, company] = await Promise.all([
        tx.employee.findUnique({ where: { id }, include: { manager: { select: { id: true, name: true } } } }),
        tx.company.findUniqueOrThrow({ where: { id: user.companyId } }),
      ]);
      if (!e) throw new NotFoundException("Employee not found");
      const structure = salaryStructure(e.annualCtc, { basicPct: company.basicPct, hraPct: company.hraPct });
      return { ...e, bankAccount: mask(e.bankAccount), structure };
    });
  }

  @Post()
  @Roles("OWNER", "HR")
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateEmployee)) body: z.infer<typeof CreateEmployee>) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      // Foreign keys ignore row-level security, so confirm the manager is visible to this company.
      if (body.managerId && !(await tx.employee.findUnique({ where: { id: body.managerId }, select: { id: true } }))) {
        throw new NotFoundException("Manager not found");
      }
      const code = body.code ?? (await nextCode(tx));
      try {
        const e = await tx.employee.create({
          data: {
            ...body,
            code,
            companyId: user.companyId,
            state: CITIES[body.city],
            dateOfJoining: toDate(body.dateOfJoining),
          },
        });
        await audit(tx, user, "employee.create", "employee", e.id, { code, name: e.name });
        return { ...e, bankAccount: mask(e.bankAccount) };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictException("An employee with this code or PAN already exists");
        }
        throw err;
      }
    });
  }
}

async function nextCode(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<{ n: number | null }[]>`
    SELECT max(substring(code from '[0-9]+$')::int) AS n FROM employee`;
  return `EMP${String((rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;
}
