import { ROUND_LABEL, eokLabel, type AnalysisResult, type NewsAnalysis } from "@/lib/services/analyzer";
import { diceSimilarity } from "@/lib/services/textSimilarity";
import type { PensionPoint } from "@/lib/repositories/pensionSnapshot";
import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import { STALE_DAYS } from "@/lib/services/newsCoverage";
import { CONFLICT_STAGES, MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

export type EventKind =
  | "award" | "investment" | "positive_press" | "negative_press"
  | "headcount_up" | "headcount_down" | "closure" | "venture_expiry" | "source_conflict" | "silence" | "profit_turn"
  | "lawsuit" | "recall" | "sanction";
export type Severity = "alert" | "notice" | "positive" | "info";
export type Trust = "verified" | "needs_review" | null;
export type Evidence = { label: string; link?: string; ym?: [string, string]; source?: string };
export type NewEvent = {
  companyId: number; kind: EventKind; severity: Severity; occurredAt: Date; title: string;
  evidenceKey: string; evidence: Evidence[]; runId: number | null; trust: Trust;
};

export const POSITIVE_PRESS_MIN = 6;
export const NEGATIVE_PRESS_MAX = -4;
export const HEADCOUNT_RATIO = 0.2;
export const VENTURE_EXPIRY_DAYS = 60;
export const SILENCE_DAYS = STALE_DAYS;

export const SEVERITY_ORDER: Severity[] = ["alert", "notice", "positive", "info"];
export const SEVERITY_LABEL: Record<Severity, string> = { alert: "경보", notice: "주의", positive: "긍정", info: "정보" };
export const KIND_LABEL: Record<EventKind, string> = {
  award: "수상", investment: "투자", positive_press: "긍정 보도", negative_press: "부정 보도",
  headcount_up: "인원 증가", headcount_down: "인원 감소", closure: "휴·폐업", venture_expiry: "벤처확인 만료",
  source_conflict: "동명 타사 충돌", silence: "무보도", profit_turn: "흑자 전환",
  lawsuit: "소송", recall: "리콜", sanction: "규제 제재",
};

const DAY_MS = 86_400_000;
const STAGE_SHORT = new Map(MATRIX_STAGES.map((stage) => [stage.key, stage.short]));

export const NEWS_EVENT_KINDS: EventKind[] = ["award", "investment", "positive_press", "negative_press", "lawsuit", "recall", "sanction"];

/** 부정 기사 중 따로 경보로 올릴 종류 — 실적 부진과 소송은 같은 칸에 둘 수 없다. */
const NEGATIVE_ALERT_KINDS: Partial<Record<string, EventKind>> = { lawsuit: "lawsuit", recall: "recall", sanction: "sanction" };
export const STORY_WINDOW_DAYS = 7;
export const STORY_SIMILARITY = 0.4;

type StoryRef = { companyId: number; kind: EventKind; occurredAt: Date; title: string };

function storyTitle(title: string) {
  return title.replace(/^[^—]*— /, "");
}

/**
 * 두 사건이 같은 실제 사건의 다른 기사인지 판정한다 — 같은 (기업, 뉴스 종류)이고 7일 이내, 제목 유사도 0.4 이상.
 * 언론사마다 다르게 쓴 같은 소식이 개별 건수로 집계되는 것을 막는다. 문턱은 실데이터 검정으로 정했다.
 */
export function isSameStory(a: StoryRef, b: StoryRef): boolean {
  if (a.companyId !== b.companyId || a.kind !== b.kind) return false;
  if (!NEWS_EVENT_KINDS.includes(a.kind)) return false;
  if (Math.abs(a.occurredAt.getTime() - b.occurredAt.getTime()) > STORY_WINDOW_DAYS * DAY_MS) return false;
  return diceSimilarity(storyTitle(a.title), storyTitle(b.title)) >= STORY_SIMILARITY;
}

export function compareSeverity(a: Severity, b: Severity) {
  return SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b);
}

/**
 * 대시보드에 올릴 사건만 남긴다 — 해소돼 자동 정리된 동명 충돌은 이력이지 이달의 사건이 아니다.
 */
export function dashboardEvents<T extends { kind: EventKind; status: string }>(events: T[]): T[] {
  return events.filter((event) => !(event.kind === "source_conflict" && event.status === "done"));
}

/**
 * 「미확인」의 단 하나의 정의 — 아직 확인하지 않은 경보·주의다.
 * 긍정·정보는 확인 버튼이 붙지 않아 세면 0 이 될 수 없고, 동명 충돌은 일괄 확인이 일부러 건드리지 않는다.
 * 밴드·리본·기업 목록·월간 문서가 전부 이 함수를 쓴다. 화면마다 다른 수를 말하면 어느 것도 못 믿는다.
 */
export function isUnacknowledged(event: { kind: string; severity: Severity; status: string }): boolean {
  if (event.kind === "source_conflict") return false;
  if (event.severity !== "alert" && event.severity !== "notice") return false;
  return event.status === "open";
}

function articleEvent(companyId: number, runId: number, trust: Trust, analysis: NewsAnalysis, kind: EventKind, severity: Severity, title: string, label: string): NewEvent {
  return {
    companyId, kind, severity, runId, trust, title,
    occurredAt: new Date(analysis.news.published),
    evidenceKey: analysis.news.link,
    evidence: [{ label, link: analysis.news.link }],
  };
}

/**
 * 분석 결과에서 수상·투자·긍정/부정 보도 사건을 뽑는다. 회사가 주제인 기사만 본다.
 * 한 기사가 여러 사건을 낼 수 있다 — 종류마다 키 공간이 다르다.
 */
export function extractAnalysisEvents(input: { companyId: number; runId: number; result: AnalysisResult; trust: Trust }): NewEvent[] {
  const events: NewEvent[] = [];
  for (const analysis of input.result.analyses) {
    if (!analysis.isAboutCompany) continue;
    const make = (kind: EventKind, severity: Severity, title: string, label: string) =>
      events.push(articleEvent(input.companyId, input.runId, input.trust, analysis, kind, severity, title, label));

    if (analysis.award.is_award_related === "Y") make("award", "positive", `수상 — ${analysis.award.award_name}`, analysis.award.award_name);
    if (analysis.investment.is_investment_related === "Y") {
      const { investment_name: name, investment_round: round, investment_amount_krw: amount } = analysis.investment;
      // 라운드·금액이 기사에 있었으면 제목에 적는다 — "투자" 만으로는 시드와 IPO 를 가를 수 없다.
      const detail = [ROUND_LABEL[round ?? "none"], eokLabel(amount)].filter(Boolean).join(" ");
      make("investment", "positive", `투자 — ${detail || name}`, name);
    }
    if (analysis.trend.sentiment_score >= POSITIVE_PRESS_MIN) make("positive_press", "positive", `긍정 보도 — ${analysis.news.title}`, analysis.news.title);
    if (analysis.trend.sentiment_score <= NEGATIVE_PRESS_MAX) {
      const kind = NEGATIVE_ALERT_KINDS[analysis.trend.negative_kind ?? "none"];
      if (kind) make(kind, "alert", `${KIND_LABEL[kind]} — ${analysis.news.title}`, analysis.news.title);
      else make("negative_press", "notice", `부정 보도 — ${analysis.news.title}`, analysis.news.title);
    }
  }
  return events;
}

function endOfMonth(ym: string) {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4, 6)), 0));
}

function ratioEvent(companyId: number, from: PensionPoint, to: PensionPoint): NewEvent | null {
  if (from.subscribers === null || to.subscribers === null || from.subscribers === 0) return null;
  const ratio = (to.subscribers - from.subscribers) / from.subscribers;
  if (Math.abs(ratio) < HEADCOUNT_RATIO) return null;
  const pct = `${ratio > 0 ? "+" : "−"}${Math.round(Math.abs(ratio) * 100)}%`;
  return {
    companyId, kind: ratio > 0 ? "headcount_up" : "headcount_down", severity: ratio > 0 ? "positive" : "notice",
    occurredAt: endOfMonth(to.ym), title: `인원 ${from.subscribers} → ${to.subscribers}명 (${pct})`,
    evidenceKey: to.ym, evidence: [{ label: `${from.subscribers} → ${to.subscribers}명`, ym: [from.ym, to.ym] }],
    runId: null, trust: null,
  };
}

/**
 * 최신 달을 직전 달·12개월 전과 비교해 ±20% 이상이면 인원 사건을 낸다. 둘 다 걸려도 하나만 낸다.
 */
export function extractPensionEvents(input: { companyId: number; points: PensionPoint[] }): NewEvent[] {
  const points = [...input.points].sort((a, b) => a.ym.localeCompare(b.ym));
  const latest = points.at(-1);
  if (!latest) return [];
  const previous = points.at(-2);
  const yearAgo = points.find((p) => p.ym === `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4)}`);
  const hit = (previous && ratioEvent(input.companyId, previous, latest)) || (yearAgo && ratioEvent(input.companyId, yearAgo, latest)) || null;
  return hit ? [hit] : [];
}

function dateFromYmd(raw: string | undefined): Date | null {
  if (!raw || !/^\d{8}$/.test(raw)) return null;
  return new Date(Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8))));
}

/**
 * 원천 스냅샷에서 휴·폐업, 벤처확인 만료, 흑자 전환, 동명 타사 충돌을 뽑는다.
 * 사건 날짜는 원천이 준 날짜(폐업일)를 우선하고, 없으면 조회 시각이다 — 조회일로 적으면 오래된 폐업이 새 사건처럼 보인다.
 */
export function extractSourceEvents(input: { companyId: number; snapshots: StoredSnapshot[]; now: Date }): NewEvent[] {
  const events: NewEvent[] = [];
  for (const snap of input.snapshots) {
    const base = { companyId: input.companyId, occurredAt: snap.fetchedAt, runId: null, trust: null } as const;

    if (snap.source === "nts" && /^(폐업|휴업)/.test(snap.summary)) {
      const state = snap.summary.split(" · ")[0];
      const closedAt = dateFromYmd((snap.payload as { closedAt?: string } | null)?.closedAt);
      events.push({ ...base, occurredAt: closedAt ?? snap.fetchedAt, kind: "closure", severity: "alert", title: `휴·폐업 — ${snap.summary}`, evidenceKey: `nts:${state}`, evidence: [{ label: snap.summary, source: "nts" }] });
    }

    if (snap.source === "nps") {
      const withdrawnAt = (snap.payload as { withdrawnAt?: string } | null)?.withdrawnAt;
      if (withdrawnAt) {
        events.push({ ...base, occurredAt: dateFromYmd(withdrawnAt) ?? snap.fetchedAt, kind: "closure", severity: "alert", title: `연금 사업장 탈퇴 — ${withdrawnAt}`, evidenceKey: `nps:탈퇴:${withdrawnAt}`, evidence: [{ label: `연금 사업장 탈퇴 ${withdrawnAt}`, source: "nps" }] });
      }
    }

    if (snap.source === "venture" && snap.status === "found") {
      const validUntil = (snap.payload as { validUntil?: string } | null)?.validUntil;
      if (validUntil) {
        const daysLeft = (Date.parse(validUntil) - input.now.getTime()) / DAY_MS;
        if (daysLeft <= VENTURE_EXPIRY_DAYS) {
          const title = daysLeft < 0 ? `벤처확인 만료 — ${validUntil}` : `벤처확인 만료 임박 — ${validUntil} 까지`;
          events.push({ ...base, kind: "venture_expiry", severity: "notice", title, evidenceKey: `venture:${validUntil}`, evidence: [{ label: `유효기간 ${validUntil} 까지`, source: "venture" }] });
        }
      }
    }

    if (snap.source === "dartFinance" && snap.status === "found") {
      const finance = snap.payload as { fiscalYear?: number; operatingIncome?: number | null; previous?: { operatingIncome?: number | null } } | null;
      const current = finance?.operatingIncome ?? null;
      const previous = finance?.previous?.operatingIncome ?? null;
      // 전년이 없으면 조용히 넘긴다 — 결측은 손실이 아니다. 손실이 줄어든 것도 전환이 아니다.
      if (current !== null && previous !== null && previous < 0 && current > 0) {
        const year = finance?.fiscalYear ?? snap.fetchedAt.getUTCFullYear();
        events.push({ ...base, kind: "profit_turn", severity: "positive", title: `흑자 전환 — ${year} 영업이익`, evidenceKey: `dartFinance:profit_turn:${year}`, evidence: [{ label: `영업이익 ${previous} → ${current}`, source: "dartFinance" }] });
      }
    }

    if (snap.status === "conflict" && (CONFLICT_STAGES as readonly string[]).includes(snap.source)) {
      events.push({ ...base, kind: "source_conflict", severity: "notice", title: `동명 타사 충돌 — ${STAGE_SHORT.get(snap.source) ?? snap.source}`, evidenceKey: `${snap.source}:conflict`, evidence: [{ label: snap.summary, source: snap.source }] });
    }
  }
  return events;
}
