// Prepares a clean test database before the e2e suite: recreate it, apply migrations, create the app role.
// It only ever touches a database whose name ends in "_test".
const { execSync } = require("node:child_process");
const { Client } = require("pg");

module.exports = async () => {
  const owner = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/softlynx_people_test";
  const dbName = new URL(owner).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to recreate "${dbName}": the test database name must end in _test`);
  }

  const maintenance = new URL(owner);
  maintenance.pathname = "/postgres";
  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const appPassword = "test-app-password";
  const env = { ...process.env, DATABASE_URL: owner, APP_DB_PASSWORD: appPassword };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("node scripts/setup-app-role.js", { env, stdio: "inherit" });

  const app = new URL(owner);
  app.username = "softlynx_app";
  app.password = appPassword;
  process.env.DATABASE_URL = owner;
  process.env.APP_DATABASE_URL = app.toString();
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
};
