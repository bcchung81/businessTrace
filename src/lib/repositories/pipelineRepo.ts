import { prisma } from "@/lib/db";
import { KST_OFFSET_MS } from "@/lib/services/kst";
import { failedGates } from "@/lib/services/verificationScores";

function jsonLength(json: string) {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 기업별 최신 실행 하나씩만 세어 기사 수·분석 완료·기사 없음을 낸다 — 재실행분을 더하면 기사가 두 번 세어진다.
 */
export async function summariseCollection(year: number) {
  const runs = await prisma.analysisRun.findMany({
    where: { company: { year, isActive: true }, status: { in: ["completed", "no_news"] } },
    orderBy: { createdAt: "desc" },
    select: { companyId: true, status: true, newsJson: true, duplicatesRemoved: true },
  });
  const seen = new Set<number>();
  let articles = 0;
  let analysed = 0;
  let noNews = 0;
  let duplicatesRemoved = 0;
  for (const run of runs) {
    if (seen.has(run.companyId)) continue;
    seen.add(run.companyId);
    articles += jsonLength(run.newsJson);
    duplicatesRemoved += run.duplicatesRemoved;
    if (run.status === "completed") analysed += 1;
    else noNews += 1;
  }
  return { articles, analysed, noNews, duplicatesRemoved };
}

export async function summariseCells(year: number) {
  const rows = await prisma.sourceSnapshot.groupBy({ by: ["status"], where: { company: { year, isActive: true } }, _count: true });
  const count = (status: string) => rows.find((row) => row.status === status)?._count ?? 0;
  return { found: count("found"), conflict: count("conflict"), pending: count("pending"), absent: count("absent"), unmeasurable: count("unmeasurable") };
}

/**
 * 마지막으로 활성 기업 전부가 같은 날 조회된 날 — 한두 곳만 다시 본 날을 "원천 갱신일" 로 내보이지 않는다.
 */
export async function fullSourceRefreshAt(year: number): Promise<string | null> {
  const total = await prisma.company.count({ where: { year, isActive: true } });
  if (total === 0) return null;
  const rows = await prisma.sourceSnapshot.findMany({ where: { company: { year, isActive: true } }, select: { companyId: true, fetchedAt: true } });
  const byDay = new Map<number, { companies: Set<number>; latest: Date }>();
  for (const row of rows) {
    const day = Math.floor((row.fetchedAt.getTime() + KST_OFFSET_MS) / 86_400_000);
    const entry = byDay.get(day) ?? { companies: new Set<number>(), latest: row.fetchedAt };
    entry.companies.add(row.companyId);
    if (row.fetchedAt > entry.latest) entry.latest = row.fetchedAt;
    byDay.set(day, entry);
  }
  const full = [...byDay.entries()].filter(([, entry]) => entry.companies.size >= total).sort((a, b) => b[0] - a[0])[0];
  return full ? full[1].latest.toISOString() : null;
}

export type ReviewListItem = { id: number; name: string; reasons: string[]; failed: string[] };
export type OpenEventItem = { id: number; companyId: number; companyName: string; title: string; severity: "alert" | "notice" };

/**
 * 사람이 정할 것이 남은 기업 수와 그 내역 — 확인 필요 블록과 같은 조건이되 가볍게 센다.
 * 목록은 등록 순서고 기업마다 걸린 이유를 함께 낸다 — 리본이 이 목록을 펼쳐 고르게 한다.
 */
export async function countReviewCompanies(year: number) {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      businessNo: true,
      sourceSnapshots: { where: { status: "conflict" }, select: { source: true } },
      sourceDecisions: { select: { source: true } },
      events: { where: { severity: { in: ["alert", "notice"] }, status: "open" }, select: { id: true, title: true, severity: true, occurredAt: true } },
      analysisRuns: {
        where: { status: { not: "collected" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true, verification: { select: { status: true, reviewedAt: true, faithfulness: true, sourceCoverage: true, evidenceMatch: true } } },
      },
    },
  });
  const ids: number[] = [];
  const items: ReviewListItem[] = [];
  const needsReviewIds: number[] = [];
  const dated: Array<{ at: number; event: OpenEventItem }> = [];
  let openAlertNotice = 0;
  for (const company of companies) {
    const decided = new Set(company.sourceDecisions.map((d) => d.source));
    const conflicts = company.sourceSnapshots.filter((s) => !decided.has(s.source)).length;
    const verification = company.analysisRuns[0]?.verification;
    const unreviewed = verification !== null && verification !== undefined && verification.status !== "verified" && !verification.reviewedAt;
    const noNews = company.analysisRuns[0]?.status === "no_news";
    const reasons: string[] = [];
    if (!company.businessNo) reasons.push("사업자번호 미확보");
    if (conflicts > 0) reasons.push(`동명 충돌 ${conflicts}`);
    if (unreviewed) reasons.push("검토 필요");
    if (company.events.length > 0) reasons.push(`미확인 경보·주의 ${company.events.length}`);
    if (noNews) reasons.push("기사 0건");
    openAlertNotice += company.events.length;
    if (unreviewed) needsReviewIds.push(company.id);
    if (reasons.length > 0) {
      ids.push(company.id);
      const failed = unreviewed && verification ? failedGates({ sourceCoverage: verification.sourceCoverage ?? 0, faithfulness: verification.faithfulness, evidenceMatch: verification.evidenceMatch ?? 0 }) : [];
      items.push({ id: company.id, name: company.name, reasons, failed });
    }
    for (const event of company.events) {
      dated.push({
        at: event.occurredAt.getTime(),
        event: { id: event.id, companyId: company.id, companyName: company.name, title: event.title, severity: event.severity === "alert" ? "alert" : "notice" },
      });
    }
  }
  const openEvents = dated.sort((a, b) => b.at - a.at).map((entry) => entry.event);
  return { companies: ids.length, ids, items, openEvents, openAlertNotice, needsReview: needsReviewIds.length, needsReviewIds };
}
