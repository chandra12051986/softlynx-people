-- Row-level security: a session only sees rows of the company named in
-- app.company_id, which the API sets at the start of every transaction.
-- FORCE makes the policies apply to the table owner too; only superusers and
-- roles with BYPASSRLS skip them, and the API connects as neither.

CREATE OR REPLACE FUNCTION current_company_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.company_id', true), '')::uuid $$;

ALTER TABLE "company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company" FORCE ROW LEVEL SECURITY;
CREATE POLICY company_isolation ON "company"
  USING (id = current_company_id()) WITH CHECK (id = current_company_id());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee', 'attendance_day', 'leave_request', 'payroll_run', 'payslip', 'audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id())',
      t);
  END LOOP;
END $$;
