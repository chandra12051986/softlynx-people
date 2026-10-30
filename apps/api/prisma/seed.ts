// Development seed: `pnpm db:seed`. Creates Softlynx Dataworks with sample staff and four logins.
import { PrismaClient } from "@prisma/client";
import { seedSoftlynx } from "./demo-data";

async function main() {
  const prisma = new PrismaClient();
  const password = process.env.SEED_PASSWORD ?? "ChangeMe!2026";
  const logins = await seedSoftlynx(prisma, password);
  await prisma.$disconnect();
  console.log("Seeded Softlynx Dataworks. Sign in with:");
  for (const email of [logins.owner, logins.hr, logins.manager, logins.employee]) console.log(`  ${email}`);
  console.log(`Password: ${password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
