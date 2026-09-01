import { prisma } from "@/lib/db";
import type { AwardMatch } from "@/lib/services/procurementWins";

/**
 * 매칭된 낙찰을 기업별로 저장한다.
 * 같은 공고를 다시 스캔해도 한 행으로 접힌다 — 배치를 겹쳐 돌려도 건수가 부풀지 않는다.
 */
export async function saveAwards(matches: AwardMatch[]) {
  for (const { companyId, matchedBy, award } of matches) {
    const data = {
      bidNoticeNo: award.bidNoticeNo,
      category: award.category,
      title: award.title,
      agency: award.agency,
      amount: award.amount,
      awardedAt: award.awardedAt,
      matchedBy,
      winnerName: award.winnerName,
      fetchedAt: new Date(),
    };

    await prisma.procurementAward.upsert({
      where: { companyId_awardKey: { companyId, awardKey: award.awardKey } },
      create: { companyId, awardKey: award.awardKey, ...data },
      update: data,
    });
  }

  return matches.length;
}

/** 기업의 낙찰 기록을 최근 순으로 낸다. */
export async function listAwards(companyId: number) {
  return prisma.procurementAward.findMany({
    where: { companyId },
    orderBy: [{ awardedAt: "desc" }, { id: "desc" }],
  });
}
