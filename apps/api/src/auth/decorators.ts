import { ExecutionContext, ForbiddenException, SetMetadata, createParamDecorator } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthUser } from "./auth.types";

export const IS_PUBLIC = "isPublic";
export const ROLES = "roles";

/** Skips authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Limits a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const isHr = (u: AuthUser) => u.role === "OWNER" || u.role === "HR";

/** The signed-in user's own employee record, or a 403 for accounts without one. */
export function ownEmployeeId(u: AuthUser): string {
  if (!u.employeeId) throw new ForbiddenException("This account isn't linked to an employee record");
  return u.employeeId;
}
