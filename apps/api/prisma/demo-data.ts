import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, Role, WorkState } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Sample people for development and tests. Names, PANs and salaries are invented. */
const SOFTLYNX_STAFF: [code: string, name: string, designation: string, department: string, city: string, state: WorkState, doj: string, ctc: number][] = [
  ["SLX001", "Ramesh Kumar Varma", "Director, Engineering", "Data Engineering", "Hyderabad", "TS", "2019-04-01", 3200000],
  ["SLX002", "Priya Nair", "HR Manager", "HR & Admin", "Hyderabad", "TS", "2020-06-15", 1400000],
  ["SLX003", "Arjun Reddy", "Senior Data Engineer", "Data Engineering", "Hyderabad", "TS", "2021-01-11", 1800000],
  ["SLX004", "Ananya Iyer", "Data Analyst", "Analytics", "Hyderabad", "TS", "2023-07-03", 720000],
  ["SLX005", "Mohammed Faizan", "Data Engineer", "Data Engineering", "Hyderabad", "TS", "2022-09-19", 960000],
  ["SLX006", "Lakshmi Prasanna", "BI Developer", "Analytics", "Vijayawada", "AP", "2022-02-14", 840000],
  ["SLX007", "Vikram Singh", "Sales Manager", "Sales", "Bengaluru", "KA", "2021-08-02", 1500000],
  ["SLX008", "Sneha Kulkarni", "Product Manager", "Product", "Bengaluru", "KA", "2020-11-23", 2200000],
  ["SLX009", "Karthik Rao", "Accounts Executive", "Finance", "Hyderabad", "TS", "2023-03-06", 540000],
  ["SLX010", "Divya Menon", "ML Engineer", "Analytics", "Bengaluru", "KA", "2024-01-08", 1200000],
  ["SLX011", "Suresh Babu", "Office Assistant", "HR & Admin", "Hyderabad", "TS", "2022-05-16", 240000],
  ["SLX012", "Fatima Shaikh", "Business Development Executive", "Sales", "Bengaluru", "KA", "2024-06-10", 480000],
  ["SLX013", "Naveen Chowdary", "Data Operations Associate", "Data Operations", "Visakhapatnam", "AP", "2025-07-14", 300000],
  ["SLX014", "Rekha Devi", "Front Office Executive", "HR & Admin", "Hyderabad", "TS", "2025-02-03", 264000],
];

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const fakePan = (i: number, surname: string) => `ABC${"P"}${surname[0].toUpperCase()}${String(1000 + i * 37).slice(0, 4)}${"KLMNPQRSTU"[i % 10]}`;

/** Runs `fn` with row-level security scoped to `companyId`, so seeding works whether or not the owner bypasses RLS. */
function asCompany<T>(prisma: PrismaClient, companyId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return fn(tx);
  });
}

export interface DemoLogins {
  companyId: string;
  owner: string;
  hr: string;
  employee: string;
  manager: string;
  password: string;
}

export async function seedCompany(
  prisma: PrismaClient,
  opts: { name: string; legalName: string; domain: string; codePrefix: string; staff?: typeof SOFTLYNX_STAFF; password: string },
): Promise<DemoLogins> {
  const companyId = randomUUID();
  const staff = opts.staff ?? SOFTLYNX_STAFF;
  const hash = await bcrypt.hash(opts.password, 10);

  const ids = await asCompany(prisma, companyId, async (tx) => {
    await tx.company.create({
      data: {
        id: companyId,
        name: opts.name,
        legalName: opts.legalName,
        city: "Hyderabad, Telangana",
        ptRegistrations: { TS: "", AP: "", KA: "" },
      },
    });
    const byCode = new Map<string, string>();
    for (const [i, [code, name, designation, department, city, state, doj, ctc]] of staff.entries()) {
      const id = randomUUID();
      const realCode = code.replace(/^SLX/, opts.codePrefix);
      byCode.set(realCode, id);
      const surname = name.split(" ").at(-1)!;
      await tx.employee.create({
        data: {
          id,
          companyId,
          code: realCode,
          name,
          email: `${name.split(" ")[0].toLowerCase()}.${surname.toLowerCase()}@${opts.domain}`,
          designation,
          department,
          city,
          state,
          dateOfJoining: date(doj),
          annualCtc: ctc,
          pan: fakePan(i, surname),
          bankAccount: String(50100000000 + i * 7919),
          ifsc: "HDFC0001234",
          managerId: i === 0 ? null : byCode.get(`${opts.codePrefix}001`),
        },
      });
    }
    return byCode;
  });

  const p = opts.codePrefix;
  const users: [string, Role, string | null][] = [
    [`admin@${opts.domain}`, "OWNER", null],
    [`hr@${opts.domain}`, "HR", ids.get(`${p}002`)!],
    [`ananya@${opts.domain}`, "EMPLOYEE", ids.get(`${p}004`)!],
    [`ramesh@${opts.domain}`, "EMPLOYEE", ids.get(`${p}001`)!],
  ];
  for (const [email, role, employeeId] of users) {
    await prisma.user.create({ data: { companyId, email, passwordHash: hash, role, employeeId } });
  }
  return {
    companyId,
    owner: users[0][0],
    hr: users[1][0],
    employee: users[2][0],
    manager: users[3][0],
    password: opts.password,
  };
}

export function seedSoftlynx(prisma: PrismaClient, password: string) {
  return seedCompany(prisma, {
    name: "Softlynx Dataworks",
    legalName: "Softlynx Dataworks Pvt Ltd",
    domain: "softlynx.example",
    codePrefix: "SLX",
    password,
  });
}
