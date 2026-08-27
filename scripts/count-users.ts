import { prisma } from "../src/lib/db";

async function main() {
  console.log(await prisma.user.count());
}

main();
