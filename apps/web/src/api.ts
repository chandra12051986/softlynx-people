export type Role = "OWNER" | "HR" | "EMPLOYEE";

export interface Session {
  token: string;
  user: { sub: string; companyId: string; role: Role; employeeId: string | null };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

const KEY = "softlynx-session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the session lasts until the tab closes
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T>(path: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const session = loadSession();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && session) onUnauthorized();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body.errors ?? []);
  }
  return (init.raw ? res.text() : res.json()) as Promise<T>;
}

/* ---------- shapes returned by the API ---------- */

export type WorkState = "TS" | "AP" | "KA";

export interface Employee {
  id: string;
  code: string;
  name: string;
  email: string | null;
  designation: string;
  department: string;
  city: string;
  state: WorkState;
  dateOfJoining: string;
  annualCtc: number;
  pan: string;
  bankAccount: string | null;
  status: string;
}

export interface Breakdown {
  daysInMonth: number;
  paidDays: number;
  lopDays: number;
  earnings: { basic: number; hra: number; special: number; gross: number };
  deductions: { pf: number; esi: number; pt: number; tds: number; total: number };
  employer: { epf: number; eps: number; esi: number };
  netPay: number;
}

export interface Payslip {
  id: string;
  month: string;
  netPay: number;
  netPayInWords: string;
  breakdown: Breakdown;
  employee?: { code: string; name: string; designation: string; state: WorkState };
}

export interface LeaveRequest {
  id: string;
  type: "CL" | "SL" | "EL";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  employeeId: string;
  employee: { id: string; code: string; name: string; designation: string };
}

export const STATE_NAMES: Record<WorkState, string> = { TS: "Telangana", AP: "Andhra Pradesh", KA: "Karnataka" };
export const LEAVE_NAMES = { CL: "Casual leave", SL: "Sick leave", EL: "Earned leave" } as const;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const rupees = (n: number) => inr.format(Math.round(n));
export const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(2)} L`);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const dateLabel = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${d.slice(0, 4)}`;

export function currentMonth(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
