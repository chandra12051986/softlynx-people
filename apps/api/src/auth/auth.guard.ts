import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import { AuthUser } from "./auth.types";
import { IS_PUBLIC, ROLES } from "./decorators";

/** Applied to every route: requires a valid token unless @Public, then checks @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Sign in to continue");
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      throw new UnauthorizedException("Your session has expired. Sign in again.");
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes((req.user as AuthUser).role)) {
      throw new ForbiddenException("Your role doesn't allow this");
    }
    return true;
  }
}
