import { Body, Controller, Get, Patch } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { ZodPipe, audit } from "../common/http";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser, Roles } from "../auth/decorators";

const CompanyPatch = z
  .object({
    name: z.string().trim().min(1),
    legalName: z.string().trim().min(1),
    city: z.string().trim(),
    pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN should look like AAKCS1234L"),
    tan: z.string().regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, "TAN should look like HYDS12345E"),
    pfCode: z.string().trim(),
    esiCode: z.string().trim(),
    ptRegistrations: z.record(z.enum(["TS", "AP", "KA"]), z.string().trim()),
    basicPct: z.number().int().min(30).max(70),
    hraPct: z.number().int().min(0).max(50),
    leavePolicy: z.object({ CL: z.number().int().min(0).max(60), SL: z.number().int().min(0).max(60), EL: z.number().int().min(0).max(60) }),
  })
  .partial();

@Controller("company")
export class CompanyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.prisma.forCompany(user.companyId, (tx) => tx.company.findUniqueOrThrow({ where: { id: user.companyId } }));
  }

  @Patch()
  @Roles("OWNER")
  update(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CompanyPatch)) body: z.infer<typeof CompanyPatch>) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const company = await tx.company.update({ where: { id: user.companyId }, data: body });
      await audit(tx, user, "company.update", "company", company.id, body);
      return company;
    });
  }
}
