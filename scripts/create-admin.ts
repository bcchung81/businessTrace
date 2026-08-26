import { createAdminAccount } from "../src/lib/services/adminAccount";

async function main() {
  const email = process.argv[2];
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3];

  if (!email || !password) {
    console.error("usage: ADMIN_PASSWORD=<password> npx tsx scripts/create-admin.ts <email>");
    console.error("       npx tsx scripts/create-admin.ts <email> <password>");
    process.exit(1);
  }

  const result = await createAdminAccount({ email, password });

  if (!result.ok) {
    console.error(`계정 생성 실패 — ${result.message}`);
    process.exit(1);
  }

  console.log(`계정 생성 완료 — ${result.email} (id ${result.id})`);
}

main();
