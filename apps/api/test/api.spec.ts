import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { todayIst } from "../src/common/http";
import { DemoLogins, seedCompany, seedSoftlynx } from "../prisma/demo-data";

const PASSWORD = "Test!Pass2026";
let app: INestApplication;
let owner: PrismaClient;
let softlynx: DemoLogins;
let acme: DemoLogins;

async function login(email: string): Promise<string> {
  const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password: PASSWORD }).expect(200);
  return res.body.token;
}
const as = (token: string) => ({
  get: (path: string) => request(app.getHttpServer()).get(`/api${path}`).set("Authorization", `Bearer ${token}`),
  post: (path: string, body?: object) => request(app.getHttpServer()).post(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
  put: (path: string, body?: object) => request(app.getHttpServer()).put(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
  patch: (path: string, body?: object) => request(app.getHttpServer()).patch(`/api${path}`).set("Authorization", `Bearer ${token}`).send(body),
});

/** The next Monday at least `minDays` from today, so leave dates are always in the future and on working days. */
function nextMonday(minDays: number): string {
  const d = new Date(`${todayIst()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + minDays);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  softlynx = await seedSoftlynx(owner, PASSWORD);
  acme = await seedCompany(owner, { name: "Acme Analytics", legalName: "Acme Analytics Pvt Ltd", domain: "acme.example", codePrefix: "ACM", password: PASSWORD });
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await owner?.$disconnect();
});

describe("sign-in", () => {
  it("rejects a wrong password", async () => {
    await request(app.getHttpServer()).post("/api/auth/login").send({ email: softlynx.hr, password: "nope" }).expect(401);
  });

  it("requires a token", async () => {
    await request(app.getHttpServer()).get("/api/employees").expect(401);
  });

  it("returns the user's company", async () => {
    const me = await as(await login(softlynx.hr)).get("/auth/me").expect(200);
    expect(me.body.company.name).toBe("Softlynx Dataworks");
    expect(me.body.role).toBe("HR");
  });
});

describe("company isolation", () => {
  it("shows HR only their own company's employees", async () => {
    const res = await as(await login(softlynx.hr)).get("/employees?pageSize=100").expect(200);
    expect(res.body.total).toBe(14);
    expect(res.body.items.every((e: { code: string }) => e.code.startsWith("SLX"))).toBe(true);
  });

  it("hides another company's employee even when its id is known", async () => {
    const other = await owner.employee.findFirstOrThrow({ where: { companyId: acme.companyId } });
    await as(await login(softlynx.hr)).get(`/employees/${other.id}`).expect(404);
  });

  it("blocks writes that point at another company's employee", async () => {
    const other = await owner.employee.findFirstOrThrow({ where: { companyId: acme.companyId } });
    await as(await login(softlynx.hr)).put("/attendance", { employeeId: other.id, date: "2026-09-10", status: "ABSENT" }).expect(404);
  });

  it("returns no rows to the app role when no company is set", async () => {
    const appDb = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
    expect(await appDb.employee.count()).toBe(0);
    await appDb.$disconnect();
  });
});

describe("roles", () => {
  it("keeps employees out of HR screens", async () => {
    const t = await login(softlynx.employee);
    await as(t).get("/employees").expect(403);
    await as(t).post("/payroll/runs", { month: "2026-09" }).expect(403);
  });

  it("lets only the owner change company settings", async () => {
    await as(await login(softlynx.hr)).patch("/company", { hraPct: 50 }).expect(403);
    const res = await as(await login(softlynx.owner)).patch("/company", { tan: "HYDS12345E" }).expect(200);
    expect(res.body.tan).toBe("HYDS12345E");
  });
});

describe("employees", () => {
  it("adds an employee and derives the PT state from the city", async () => {
    const res = await as(await login(softlynx.hr))
      .post("/employees", {
        name: "Test Person",
        designation: "Data Engineer",
        department: "Data Engineering",
        city: "Bengaluru",
        dateOfJoining: "2026-10-16",
        annualCtc: 600000,
        pan: "abcde1234f",
        bankAccount: "50100012345678",
        ifsc: "hdfc0001234",
      })
      .expect(201);
    expect(res.body).toMatchObject({ state: "KA", pan: "ABCDE1234F", ifsc: "HDFC0001234", bankAccount: "XXXX5678", code: "EMP0015" });
  });

  it("explains invalid fields", async () => {
    const res = await as(await login(softlynx.hr))
      .post("/employees", { name: "X", designation: "Y", department: "Z", city: "Hyderabad", dateOfJoining: "2026-10-01", annualCtc: 600000, pan: "BAD" })
      .expect(400);
    expect(res.body.errors[0]).toEqual({ field: "pan", message: "PAN should look like ABCDE1234F" });
  });
});

describe("leave", () => {
  it("runs apply, manager approval and attendance marking end to end", async () => {
    const emp = as(await login(softlynx.employee));
    const from = nextMonday(7);
    const to = new Date(new Date(`${from}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);

    const req = await emp.post("/leave-requests", { type: "EL", fromDate: from, toDate: to, reason: "Family trip" }).expect(201);
    expect(req.body.days).toBe(3);
    await emp.post("/leave-requests", { type: "CL", fromDate: from, toDate: from, reason: "Overlap" }).expect(409);

    const balances = await emp.get("/leave-balances/me").expect(200);
    expect(balances.body.EL).toMatchObject({ quota: 15, pending: 3, available: 12 });

    // Ramesh manages everyone in the sample company
    const manager = as(await login(softlynx.manager));
    await manager.post(`/leave-requests/${req.body.id}/decision`, { approve: true }).expect(200);
    await manager.post(`/leave-requests/${req.body.id}/decision`, { approve: true }).expect(409);

    const days = await emp.get(`/attendance?month=${from.slice(0, 7)}`).expect(200);
    expect(days.body.filter((d: { status: string }) => d.status === "LEAVE").map((d: { date: string }) => d.date)).toContain(from);
  });

  it("refuses more leave than the balance", async () => {
    const emp = as(await login(softlynx.employee));
    const from = nextMonday(40);
    const to = new Date(new Date(`${from}T00:00:00Z`).getTime() + 27 * 86_400_000).toISOString().slice(0, 10);
    await emp.post("/leave-requests", { type: "CL", fromDate: from, toDate: to, reason: "Too long" }).expect(400);
  });
});

describe("payroll", () => {
  it("computes, locks and releases a month with loss of pay and state PT", async () => {
    const hr = as(await login(softlynx.hr));
    const list = await hr.get("/employees?q=Fatima").expect(200);
    const fatima = list.body.items[0];
    await hr.put("/attendance", { employeeId: fatima.id, date: "2026-09-03", status: "ABSENT" }).expect(200);

    const run = await hr.post("/payroll/runs", { month: "2026-09" }).expect(201);
    expect(run.body.run.status).toBe("DRAFT");
    expect(run.body.totals.employees).toBe(14); // the October joiner isn't in September
    expect(Object.keys(run.body.totals.professionalTaxByState).sort()).toEqual(["AP", "KA", "TS"]);

    const detail = await hr.get("/payroll/runs/2026-09?pageSize=100").expect(200);
    const slip = detail.body.payslips.find((p: { employeeId: string }) => p.employeeId === fatima.id);
    expect(slip.breakdown.lopDays).toBe(1);
    expect(slip.breakdown.deductions.pt).toBe(200); // Karnataka, gross above ₹25,000
    const suresh = detail.body.payslips.find((p: { employee: { code: string } }) => p.employee.code === "SLX011");
    expect(suresh.breakdown.deductions).toMatchObject({ pf: 1132, esi: 142, pt: 150 });

    const csv = await hr.get("/payroll/runs/2026-09/bank-file").expect(200);
    expect(csv.text.split("\n")[0]).toBe("Employee code,Name,Account number,IFSC,Amount,Narration");
    expect(csv.text).toContain('"SLX011","Suresh Babu"');

    // Employees can't see a draft
    const emp = as(await login(softlynx.employee));
    expect((await emp.get("/payslips/me").expect(200)).body).toHaveLength(0);

    await hr.post("/payroll/runs/2026-09/lock").expect(200);
    await hr.post("/payroll/runs", { month: "2026-09" }).expect(409);
    await hr.put("/attendance", { employeeId: fatima.id, date: "2026-09-04", status: "ABSENT" }).expect(409);

    const mine = await emp.get("/payslips/me").expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ month: "2026-09", netPay: 56200 });
  });

  it("keeps each company's payroll separate", async () => {
    await as(await login(acme.hr)).get("/payroll/runs/2026-09").expect(404);
  });
});
