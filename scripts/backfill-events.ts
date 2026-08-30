import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { backfillEvents } from "@/lib/services/eventBackfill";

config({ quiet: true });

/**
 * 기존 분석·연금·원천 데이터에서 사건을 추출한다. 사용: npx tsx scripts/backfill-events.ts [연도]
 */
async function main() {
  const year = Number(process.argv[2]) || new Date().getFullYear();
  const counts = await backfillEvents(year);
  console.log(`${year}년 사건 백필 — 분석 ${counts.analysis} · 연금 ${counts.pension} · 원천 ${counts.source} 건 신규`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
