import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { listAwards, saveAwards } from "@/lib/repositories/procurementAward";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { matchAwards, monthlyWindows, scanAwards, summariseAwards, type AwardCategory, type AwardMatch } from "@/lib/services/procurementWins";
import { procurementSnapshot } from "@/lib/services/sourceEvidence";

config({ quiet: true });

const CATEGORIES: AwardCategory[] = ["물품", "용역"];

/**
 * 나라장터 낙찰 목록을 기간으로 전수 스캔해 활성 기업의 실적만 적재한다.
 * 업체 단위 조회 파라미터가 없어 스캔이 무거우므로 배치로만 돈다 — 화면에서 부르지 않는다.
 * 스캔 기간은 연도와 무관하므로 연도를 주지 않으면 활성 기업 전체를 한 번에 훑는다.
 * 창 하나라도 실패하면 "미참여" 판정을 적지 않는다 — 못 본 것을 없는 것으로 적으면 안 된다.
 */
async function main() {
  const months = Number(process.argv[2]) || 12;
  const year = Number(process.argv[3]) || null;

  const companies = await prisma.company.findMany({
    where: { isActive: true, ...(year ? { year } : {}) },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: { id: true, name: true, businessNo: true },
  });

  if (companies.length === 0) {
    console.log(`${year ?? "전체"} 활성 기업이 없습니다.`);
    return;
  }

  console.log(`${year ? `${year}년 ` : ""}활성 기업 ${companies.length}개사 · 최근 ${months}개월 · ${CATEGORIES.join("+")}`);

  const matches: AwardMatch[] = [];
  let scanned = 0;
  let failedWindows = 0;

  for (const window of monthlyWindows(new Date(), months)) {
    for (const category of CATEGORIES) {
      const result = await scanAwards({ ...window, category });
      scanned += result.scanned;
      matches.push(...matchAwards(result.awards, companies));
      if (result.failed) {
        failedWindows += 1;
        console.log(`\n  [실패] ${window.from}~${window.to} ${category} — ${result.reason}`);
      }
    }
    process.stdout.write(`  ${window.from}~${window.to} · 누적 스캔 ${scanned.toLocaleString()}건 · 매칭 ${matches.length}건\r`);
  }

  const complete = failedWindows === 0;
  const saved = await saveAwards(matches);
  console.log(`\n스캔 ${scanned.toLocaleString()}건 · 저장 ${saved}건${complete ? "" : ` · 실패한 창 ${failedWindows}개 — 미참여로 적지 않는다`}`);

  for (const company of companies) {
    const stored = await listAwards(company.id);
    const summary = summariseAwards(stored);
    const row = procurementSnapshot(summary, { complete });
    await saveSourceSnapshots(company.id, [row]);
    console.log(`${summary.count > 0 ? "[OK]  " : "[없음]"} ${company.name} — ${row.summary}${company.businessNo ? "" : " · 사업자번호 미확보"}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
