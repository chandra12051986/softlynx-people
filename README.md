# Softlynx People

HR and payroll for Indian companies: employees, attendance, leave, and monthly payroll with EPF/EPS, ESI, state Professional Tax (Telangana, Andhra Pradesh, Karnataka) and TDS under the new tax regime. Built for Softlynx Dataworks first and designed to serve many customer companies from one installation.

## What's in the repository

| Path | What it is |
| --- | --- |
| `packages/payroll` | The payroll rules: salary structure from CTC, PF, ESI, Professional Tax by state, TDS, amount in words. Pure TypeScript with unit tests. Statutory rates live in `src/rules.ts` with the date each takes effect. |
| `apps/api` | NestJS API on PostgreSQL (Prisma). Sign-in, roles, employees, attendance, leave approvals, payroll runs, payslips, bank transfer file. |
| `apps/web` | React web app (Vite). HR screens for employees, leave approvals and payroll; self-service for check-in, leave and payslips. |

## How customer data is kept apart

Every table that holds a company's data has a `company_id` column protected by a PostgreSQL row-level security policy (`apps/api/prisma/migrations/*_row_level_security`). The API connects as the restricted `softlynx_app` role and sets `app.company_id` at the start of each transaction, so a query can only ever see the signed-in user's company, even if application code forgets a filter. The end-to-end tests check this with two companies.

## Run it locally

You need Node.js 22, pnpm 10 and PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # then edit the passwords and JWT_SECRET
createdb softlynx_people

cd apps/api
set -a; source .env; set +a
pnpm db:migrate     # applies migrations and creates the softlynx_app role
pnpm db:seed        # sample company with 14 invented employees
pnpm build && pnpm start          # API on http://localhost:3000/api

cd ../web
pnpm dev            # web app on http://localhost:5173
```

The seed prints four sign-ins (owner, HR manager, a manager and an employee). The password is `ChangeMe!2026` unless you set `SEED_PASSWORD`. Never run the seed against a production database.

## Tests

```bash
pnpm --filter @softlynx/payroll test     # payroll rules
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/softlynx_people_test \
  pnpm --filter @softlynx/api test       # API end to end against a real database
```

The API suite drops and recreates the test database each run, and refuses to touch any database whose name doesn't end in `_test`.

## Before the first real payroll

- Have a payroll consultant confirm every rate in `packages/payroll/src/rules.ts`.
- Run the new payroll in parallel with the current one for two months and compare each employee's net pay.
- Holidays aren't modelled yet: leave counts Monday to Friday only.

## Not built yet

State holiday calendars, old-regime tax declarations, Form 16 and 24Q exports, PF ECR and ESI upload files, bulk import from Excel, the vendor console for onboarding customer companies, and billing. See the product plan for the order.
