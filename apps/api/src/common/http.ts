import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";
import { Tx } from "../prisma.service";
import { AuthUser } from "../auth/auth.types";

/** Validates a request body or query against a zod schema. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Some fields are missing or invalid",
        errors: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }
    return result.data;
  }
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string as the UTC-midnight Date that Prisma uses for DATE columns. */
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

/** Today's date in India, YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Monday-to-Friday dates from `from` to `to`, inclusive. */
export function workingDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = toDate(from); d <= toDate(to); d = new Date(d.getTime() + 86_400_000)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(isoDate(d));
  }
  return out;
}

export async function audit(tx: Tx, user: AuthUser, action: string, entity: string, entityId?: string, detail?: object) {
  await tx.auditLog.create({
    data: { companyId: user.companyId, actorId: user.sub, action, entity, entityId, detail: detail as object | undefined },
  });
}
