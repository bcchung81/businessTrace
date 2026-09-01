import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { saveAwards } from "@/lib/repositories/procurementAward";
import { matchAwards, monthlyWindows, scanAwards, type AwardCategory, type AwardMatch } from "@/lib/services/procurementWins";

config({ quiet: true });

const CATEGORIES: AwardCategory[] = ["물품", "용역"];

/**
 * 나라장터 낙찰 목록을 기간으로 전수 스캔해 활성 기업의 실적만 적재한다.
 * 업체 단위 조회 파라미터가 없어 스캔이 무거우므로 배치로만 돈다 — 화면에서 부르지 않는다.
 * 스캔 기간은 연도와 무관하므로 연도를 주지 않으면 활성 기업 전체를 한 번에 훑는다.
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

  for (const window of monthlyWindows(new Date(), months)) {
    for (const category of CATEGORIES) {
      const result = await scanAwards({ ...window, category });
      scanned += result.scanned;
      matches.push(...matchAwards(result.awards, companies));
      if (result.failed) console.log(`\n  [실패] ${window.from}~${window.to} ${category} — ${result.reason}`);
    }
    process.stdout.write(`  ${window.from}~${window.to} · 누적 스캔 ${scanned.toLocaleString()}건 · 매칭 ${matches.length}건\r`);
  }

  const saved = await saveAwards(matches);
  console.log(`\n스캔 ${scanned.toLocaleString()}건 · 저장 ${saved}건`);

  const byCompany = new Map<number, AwardMatch[]>();
  for (const match of matches) byCompany.set(match.companyId, [...(byCompany.get(match.companyId) ?? []), match]);

  for (const company of companies) {
    const rows = byCompany.get(company.id) ?? [];
    const confirmed = rows.filter((row) => row.matchedBy === "bizno");
    const total = confirmed.reduce((sum, row) => sum + (row.award.amount ?? 0), 0);
    const candidates = rows.length - confirmed.length;
    console.log(
      confirmed.length > 0
        ? `[OK]   ${company.name} — 낙찰 ${confirmed.length}건 · ${total.toLocaleString()}원${candidates > 0 ? ` (상호 후보 ${candidates}건)` : ""}`
        : `[없음] ${company.name} — 조달 낙찰 없음${company.businessNo ? "" : " · 사업자번호 미확보로 확정 대조 불가"}${candidates > 0 ? ` (상호 후보 ${candidates}건)` : ""}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
