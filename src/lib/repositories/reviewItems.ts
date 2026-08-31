import { prisma } from "@/lib/db";
import { parseAliases } from "@/lib/services/collectForCompany";
import { failedGates } from "@/lib/services/verificationScores";

export type NpsCandidateItem = { prefix: string; name: string; address: string | null; registryMatch: boolean };
export type OpenEventItem = { id: number; occurredAt: string; severity: "alert" | "notice"; kind: string; title: string; evidence: Array<{ label: string; link?: string }> };

export type ReviewItem =
  | { kind: "no_business_no"; npsPrefix: string | null }
  | { kind: "nps_conflict"; candidates: NpsCandidateItem[]; chosen: string | null }
  | { kind: "dart_conflict"; candidate: { corpCode: string; corpName: string; stockCode: string | null } }
  | { kind: "fsc_conflict"; registryNo: string | null; fscNo: string; corpName: string }
  | {
      kind: "verification";
      runId: number;
      status: "needs_review";
      failed: string[];
      faithfulness: number | null;
      sourceCoverage: number;
      evidenceMatch: number;
      counterEvidence: string[];
      note: string | null;
    }
  | { kind: "open_events"; events: OpenEventItem[] }
  | { kind: "no_news"; aliases: string[] };

export type ReviewSummary = { items: ReviewItem[]; lastDecidedAt: string | null };

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function latest(dates: Array<Date | null | undefined>): string | null {
  const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
  return times.length === 0 ? null : new Date(Math.max(...times)).toISOString();
}

/**
 * 기업 상세 "확인 필요" 블록의 항목을 모은다 — 사람이 정해야 다음 단계가 열리는 것만.
 * 순서는 시안대로: 사업자번호 → 국민연금 충돌 → DART 충돌 → 검증 검토 → 미확인 경보·주의 → 기사 0건.
 */
export async function buildReviewItems(companyId: number): Promise<ReviewSummary | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      sourceSnapshots: true,
      sourceDecisions: true,
      events: { where: { severity: { in: ["alert", "notice"] } }, orderBy: { occurredAt: "desc" } },
      analysisRuns: { where: { status: { not: "collected" } }, orderBy: { createdAt: "desc" }, take: 1, include: { verification: true } },
    },
  });
  if (!company) return null;

  const snapshot = (source: string) => company.sourceSnapshots.find((row) => row.source === source);
  const decision = (source: string) => company.sourceDecisions.find((row) => row.source === source);
  const items: ReviewItem[] = [];

  const nps = snapshot("nps");
  const npsPayload = parse<{ businessNoPrefix?: string; candidates?: Array<{ companyName: string; businessNoPrefix: string; address?: string | null }> }>(nps?.payload);
  if (!company.businessNo) items.push({ kind: "no_business_no", npsPrefix: npsPayload?.businessNoPrefix ?? null });

  if (nps?.status === "conflict" && !decision("nps")) {
    const registryPrefix = company.businessNo?.slice(0, 6) ?? null;
    const candidates = (npsPayload?.candidates ?? []).map((candidate) => ({
      prefix: candidate.businessNoPrefix,
      name: candidate.companyName,
      address: candidate.address ?? null,
      registryMatch: registryPrefix !== null && candidate.businessNoPrefix === registryPrefix,
    }));
    items.push({ kind: "nps_conflict", candidates, chosen: null });
  }

  const dart = snapshot("dart");
  const dartPayload = parse<{ candidates?: Array<{ corpCode: string; corpName: string; stockCode: string | null }> }>(dart?.payload);
  if (dart?.status === "conflict" && !decision("dart") && dartPayload?.candidates?.[0]) {
    const first = dartPayload.candidates[0];
    items.push({ kind: "dart_conflict", candidate: { corpCode: first.corpCode, corpName: first.corpName, stockCode: first.stockCode ?? null } });
  }

  const fsc = snapshot("fsc");
  const fscPayload = parse<{ corpName?: string; businessNo?: string }>(fsc?.payload);
  if (fsc?.status === "conflict" && !decision("fsc") && fscPayload?.businessNo) {
    items.push({ kind: "fsc_conflict", registryNo: company.businessNo, fscNo: fscPayload.businessNo, corpName: fscPayload.corpName ?? "이름 미상" });
  }

  const run = company.analysisRuns[0];
  const verification = run?.verification;
  if (verification && verification.status !== "verified" && !verification.reviewedAt) {
    const scores = { sourceCoverage: verification.sourceCoverage ?? 0, faithfulness: verification.faithfulness, evidenceMatch: verification.evidenceMatch ?? 0 };
    items.push({
      kind: "verification",
      runId: run.id,
      status: "needs_review",
      failed: failedGates(scores),
      faithfulness: verification.faithfulness,
      sourceCoverage: scores.sourceCoverage,
      evidenceMatch: scores.evidenceMatch,
      counterEvidence: parse<string[]>(verification.counterEvidence) ?? [],
      note: verification.reviewNote,
    });
  }

  const open = company.events.filter((event) => event.status === "open");
  if (open.length > 0) {
    items.push({
      kind: "open_events",
      events: open.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        severity: event.severity as "alert" | "notice",
        kind: event.kind,
        title: event.title,
        evidence: parse<Array<{ label: string; link?: string }>>(event.evidenceJson) ?? [],
      })),
    });
  }

  const stats = parse<{ stats?: { scoredNews?: number } }>(run?.resultJson)?.stats;
  if (run && (run.status === "no_news" || (run.status === "completed" && stats?.scoredNews === 0))) {
    items.push({ kind: "no_news", aliases: parseAliases(company.aliases) });
  }

  return {
    items,
    lastDecidedAt: latest([...company.sourceDecisions.map((d) => d.decidedAt), verification?.reviewedAt, ...company.events.map((e) => e.reviewedAt)]),
  };
}
