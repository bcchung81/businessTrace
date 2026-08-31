import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { refreshCorpCodes } from "@/lib/services/dartCorpCode";
import { refreshSourcesFor } from "@/lib/services/refreshSources";

config({ quiet: true });

/**
 * 활성 기업의 공식 원천을 전부 조회해 스냅샷으로 적재한다.
 * 사용: npx tsx scripts/collect-sources.ts [연도]
 */
async function main() {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const only = (process.argv[3] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
  const companies = (
    await prisma.company.findMany({
      where: { year, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    })
  ).filter((company) => only.length === 0 || only.some((name) => company.name.includes(name)));

  if (companies.length === 0) {
    console.log(`${year}년 활성 기업이 없습니다.`);
    return;
  }

  await refreshCorpCodes();
  const tally: Record<string, number> = {};

  for (const company of companies) {
    const outcome = await refreshSourcesFor(company.id);
    if (!outcome) continue;
    const { snapshots, businessNoSource } = outcome;

    for (const snapshot of snapshots) {
      const key = `${snapshot.source}:${snapshot.status}`;
      tally[key] = (tally[key] ?? 0) + 1;
    }

    const line = snapshots.map((snapshot) => `${snapshot.source}=${snapshot.status}`).join(" ");
    console.log(`${company.name.padEnd(14)} [${businessNoSource ?? "없음"}] ${line}`);
  }

  console.log("\n원천별 집계");
  for (const [key, count] of Object.entries(tally).sort()) console.log(`  ${key.padEnd(26)} ${count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
