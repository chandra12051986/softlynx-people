import { Role } from "@prisma/client";

/** What the API knows about the signed-in user, carried in the JWT. */
export interface AuthUser {
  sub: string;
  companyId: string;
  role: Role;
  employeeId: string | null;
}
