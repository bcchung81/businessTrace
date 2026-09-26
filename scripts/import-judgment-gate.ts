import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { enqueueJudgments } from "@/lib/repositories/articleJudgment";
import { gateEnqueueRows, type GateItem, type GateKey } from "@/lib/services/judgments";

config({ quiet: true });

const DIR = join(process.cwd(), "data", "jev-gate");

/**
 * Jev 게이트 검토 표본(필수 53·선택 30)을 06 판정 대기열로 들인다. 이미 있는 기사는 건드리지 않아 다시 돌려도 된다.
 * 사용: npx tsx scripts/import-judgment-gate.ts
 */
async function main() {
  const items = JSON.parse(readFileSync(join(DIR, "review-items.json"), "utf8")) as GateItem[];
  const keys = JSON.parse(readFileSync(join(DIR, "review-key.json"), "utf8")) as GateKey[];
  const rows = gateEnqueueRows(items, keys);
  const companyIds = [...new Set(rows.map((row) => row.companyId))];
  const known = new Set((await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true } })).map((company) => company.id));
  const present = rows.filter((row) => known.has(row.companyId));
  const created = await enqueueJudgments(present);
  console.log(`게이트 표본 ${rows.length}건 · 기업이 없어 건너뜀 ${rows.length - present.length}건 · 새로 올림 ${created}건`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
