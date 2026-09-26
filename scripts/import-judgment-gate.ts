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
 * 표본은 dev DB 의 기업 id 로 만들어졌다 — 이름이 다른 기업에는 붙이지 않고 목록으로 알린다.
 * 사용: npx tsx scripts/import-judgment-gate.ts
 */
async function main() {
  const items = JSON.parse(readFileSync(join(DIR, "review-items.json"), "utf8")) as GateItem[];
  const keys = JSON.parse(readFileSync(join(DIR, "review-key.json"), "utf8")) as GateKey[];
  const companyIds = [...new Set(keys.map((key) => key.companyId))];
  const names = new Map((await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })).map((company) => [company.id, company.name]));
  const { rows, skipped } = gateEnqueueRows(items, keys, names);
  const created = await enqueueJudgments(rows);
  console.log(`게이트 표본 ${items.length}건 · 기업이 달라 건너뜀 ${skipped.length}건 · 새로 올림 ${created}건`);
  for (const skip of skipped) console.log(`  ${skip.id}: ${skip.reason === "missing" ? "이 DB 에 기업이 없다" : `이 DB 의 기업은 "${skip.found}"`} (표본: ${skip.expected})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
