import { config } from "dotenv";
import { prisma } from "@/lib/db";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { listPensionSeries, savePensionSeries } from "@/lib/repositories/pensionSnapshot";
import { extractPensionEvents } from "@/lib/services/eventRules";
import { lookupWorkplace } from "@/lib/services/nps";

config({ quiet: true });

/**
 * 활성 기업의 국민연금 가입 사업장 시계열을 받아 스냅샷으로 적재한다.
 * 국민연금은 12개월치만 유지하므로 매월 15일 이후 한 번씩 돌려야 연 단위 추이가 쌓인다.
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

  for (const company of companies) {
    const workplace = await lookupWorkplace(company.name, {
      businessNo: company.businessNo ?? undefined,
    });

    if (!workplace.found) {
      console.log(`[SKIP] ${company.name} — ${workplace.reason ?? "사유 없음"}`);
      if (workplace.candidates?.length) {
        for (const candidate of workplace.candidates) {
          console.log(`        후보 ${candidate.businessNoPrefix} · ${candidate.companyName} · ${candidate.address ?? ""}`);
        }
      }
      continue;
    }

    const saved = await savePensionSeries(company.id, {
      businessNoPrefix: workplace.businessNoPrefix,
      months: workplace.months,
    });

    console.log(
      `[OK]   ${company.name} — ${saved}개월 · 최근 ${workplace.subscribers ?? "?"}명 · ` +
        `사업장 ${workplace.workplaceCount ?? 1}곳 (${workplace.businessNoPrefix ?? "번호 없음"})`,
    );
  }

  const { created } = await upsertEvents((await listPensionSeries(year)).flatMap((series) => extractPensionEvents({ companyId: series.companyId, points: series.points })));
  console.log(`인원 사건 ${created}건 신규`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
