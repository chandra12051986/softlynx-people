// Creates (or updates) the restricted database role the API connects as and
// grants it data access. Run after migrations: `pnpm db:migrate`.
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!url || !password) throw new Error("DATABASE_URL and APP_DB_PASSWORD must be set");
  const client = new Client({ connectionString: url });
  await client.connect();
  const role = "softlynx_app";
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  const pw = password.replace(/'/g, "''");
  await client.query(
    exists.rowCount
      ? `ALTER ROLE ${role} WITH LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS`
      : `CREATE ROLE ${role} WITH LOGIN PASSWORD '${pw}' NOSUPERUSER NOBYPASSRLS`,
  );
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await client.query(`REVOKE ALL ON "_prisma_migrations" FROM ${role}`);
  await client.end();
  console.log(`Role ${role} is ready`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
