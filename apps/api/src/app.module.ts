import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { AuthGuard } from "./auth/auth.guard";
import { AuthController } from "./auth/auth.controller";
import { Public } from "./auth/decorators";
import { CompanyController } from "./company/company.controller";
import { EmployeesController } from "./employees/employees.controller";
import { AttendanceController } from "./attendance/attendance.controller";
import { LeaveController } from "./leave/leave.controller";
import { PayrollController } from "./payroll/payroll.controller";

@Controller("health")
class HealthController {
  @Public()
  @Get()
  ok() {
    return { status: "ok" };
  }
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  return secret;
}

@Module({
  imports: [JwtModule.register({ global: true, secret: jwtSecret(), signOptions: { expiresIn: "12h" } })],
  controllers: [HealthController, AuthController, CompanyController, EmployeesController, AttendanceController, LeaveController, PayrollController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
