import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaService } from "../prisma.service";
import { ZodPipe } from "../common/http";
import { AuthUser } from "./auth.types";
import { CurrentUser, Public } from "./decorators";

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const DUMMY_HASH = bcrypt.hashSync("no-such-user", 10);

@Controller("auth")
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    // Compare even when the user is missing so response time doesn't reveal which emails exist.
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException("Email or password is incorrect");
    const payload: AuthUser = { sub: user.id, companyId: user.companyId, role: user.role, employeeId: user.employeeId };
    return { token: await this.jwt.signAsync(payload), user: payload };
  }

  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    return this.prisma.forCompany(user.companyId, async (tx) => {
      const [company, employee] = await Promise.all([
        tx.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { id: true, name: true, legalName: true } }),
        user.employeeId ? tx.employee.findUnique({ where: { id: user.employeeId }, select: { id: true, code: true, name: true, designation: true } }) : null,
      ]);
      return { ...user, company, employee };
    });
  }
}
