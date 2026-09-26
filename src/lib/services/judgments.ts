import { z } from "zod";
import type { EnqueueInput, JudgmentAnswer, JudgmentOrigin, JudgmentRow } from "@/lib/repositories/articleJudgment";
import type { NewsAnalysis } from "@/lib/services/analyzer";
import type { NewsItem } from "@/lib/services/newsTypes";

export const GATE_SET_KEY = "jev-gate-2026-09";

type QuestionOption = { value: string; label: string; hint?: string; key: string };

export type JudgmentField = "entity" | "role" | "form" | "about";

export const JUDGMENT_QUESTIONS: Record<JudgmentField, QuestionOption[]> = {
  entity: [
    { value: "same", label: "예, 이 회사", key: "1" },
    { value: "other", label: "아니오, 다른 대상", hint: "동명 회사·브랜드·약어", key: "2" },
    { value: "unclear", label: "판단할 수 없음", hint: "본문이 없거나 근거 부족", key: "3" },
  ],
  role: [
    { value: "main", label: "주인공", hint: "기사가 이 회사 이야기", key: "Q" },
    { value: "party", label: "명시된 당사자", hint: "소수 당사자: 선정·수상·협약·계약 상대", key: "W" },
    { value: "many", label: "나열 중 하나", hint: "여러 곳 목록의 한 항목", key: "E" },
    { value: "passing", label: "스쳐 언급", key: "R" },
  ],
  form: [
    { value: "single", label: "단일 기사", key: "A" },
    { value: "roundup", label: "모음 기사", hint: "여러 소식을 묶은 기사", key: "S" },
    { value: "market", label: "시세·공시 자동기사", key: "D" },
    { value: "broken", label: "본문 불량", hint: "푸터·캡션·무관한 본문", key: "F" },
  ],
  about: [
    { value: "yes", label: "예, 주제 기사", key: "Y" },
    { value: "no", label: "아니오", key: "N" },
    { value: "unsure", label: "모르겠음", key: "U" },
  ],
};

const answerOf = (field: JudgmentField) => z.enum(JUDGMENT_QUESTIONS[field].map((option) => option.value) as [string, ...string[]]).nullable().optional();

export const judgmentPatchSchema = z
  .object({ entity: answerOf("entity"), role: answerOf("role"), form: answerOf("form"), about: answerOf("about"), note: z.string().max(2000).nullable().optional() })
  .strict() satisfies z.ZodType<Partial<JudgmentAnswer>>;

/**
 * 사람 판정을 수집된 기사에 적용한다. "주제 아님"은 분석 전에 빼고, "주제"는 관련도와 무관하게 분석에 넣어 주제로 강제한다.
 * 다시 수집되지 않은 "주제" 기사는 끼워 넣지 않는다 — 분석 기간의 뜻이 깨진다.
 */
export function applyJudgments(news: NewsItem[], overrides: { exclude: string[]; include: string[] }): { news: NewsItem[]; forceAbout: Set<string> } {
  const exclude = new Set(overrides.exclude);
  const include = new Set(overrides.include);
  const kept = news
    .filter((item) => !exclude.has(item.link))
    .map((item) => (include.has(item.link) && item.relevance !== "primary" ? { ...item, relevance: "primary" as const } : item));
  return { news: kept, forceAbout: new Set(kept.filter((item) => include.has(item.link)).map((item) => item.link)) };
}

const analyzerOf = (formulaVersion: string) => (formulaVersion.includes("jev") ? "jev" : "llm");

function snapshotRow(companyId: number, runId: number, formulaVersion: string, analysis: NewsAnalysis, origin: "held" | "manual"): EnqueueInput {
  return {
    companyId,
    link: analysis.news.link,
    title: analysis.news.title,
    source: analysis.news.source,
    published: analysis.news.published,
    body: analysis.news.content,
    origin,
    model: { analyzer: analyzerOf(formulaVersion), formulaVersion, runId, isAbout: analysis.isAboutCompany, held: analysis.held === true, confidence: analysis.trend.about_confidence ?? null },
  };
}

/**
 * 분석기가 보류한 기사를 판정 대기열 행으로 옮긴다. 본문은 지금 모습 그대로 남긴다 — 원문이 사라져도 판정 근거가 된다.
 */
export function heldEnqueueRows(input: { companyId: number; runId: number; formulaVersion: string; analyses: NewsAnalysis[] }): EnqueueInput[] {
  return input.analyses.filter((analysis) => analysis.held === true).map((analysis) => snapshotRow(input.companyId, input.runId, input.formulaVersion, analysis, "held"));
}

export function manualEnqueueRow(input: { companyId: number; runId: number; formulaVersion: string; analysis: NewsAnalysis }): EnqueueInput {
  return snapshotRow(input.companyId, input.runId, input.formulaVersion, input.analysis, "manual");
}

const decimal = (value: unknown) => (typeof value === "number" ? value.toFixed(2) : "—");

/**
 * 판정 뒤에 여는 분석기의 답 한 줄. 게이트 표본은 1차 게이트의 Sonnet·Jev 답을 적는다.
 */
export function modelVerdict(modelJson: string): string {
  let model: Record<string, unknown>;
  try {
    model = JSON.parse(modelJson) as Record<string, unknown>;
  } catch {
    return "분석기 답이 기록되지 않았습니다";
  }
  if (model.gate) {
    const sonnet = (model.sonnet ?? {}) as { conf?: number; isAbout?: number };
    return `Sonnet: ${sonnet.isAbout ? "주제" : "주제 아님"}(${decimal(sonnet.conf)}) · Jev 1차 ${decimal(model.jevFirst)}`;
  }
  if (!("analyzer" in model)) return "분석기 답이 기록되지 않았습니다";
  const verdict = model.isAbout ? "주제" : model.held ? "보류" : "주제 아님";
  return `분석기: ${verdict} · 확신 ${decimal(model.confidence)} · ${model.analyzer === "jev" ? "Jev" : "LLM"} · 실행 #${String(model.runId)}`;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namePattern(name: string) {
  const compact = name.replace(/\s+/g, "");
  return compact.length < 3 ? escapeRegex(compact) : [...compact].map(escapeRegex).join("\\s*");
}

/**
 * 본문을 회사명·별칭이 든 조각과 나머지로 가른다. 3자 이상 이름은 글자 사이 공백을 허용한다 — "서 덕 진" 같은 표기.
 * HTML 을 만들지 않고 조각을 돌려준다 — 기사 본문을 innerHTML 로 넣지 않기 위해서다.
 */
export function highlightSegments(text: string, names: string[]): Array<{ text: string; mark: boolean }> {
  const patterns = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length).map(namePattern);
  if (patterns.length === 0 || text.length === 0) return [{ text, mark: false }];
  const segments: Array<{ text: string; mark: boolean }> = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(patterns.join("|"), "gi"))) {
    if (match[0].length === 0) continue;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), mark: false });
    segments.push({ text: match[0], mark: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), mark: false });
  return segments.length > 0 ? segments : [{ text, mark: false }];
}

export type GateItem = {
  id: string;
  required: boolean;
  company: string;
  industry?: string | null;
  officialName?: string | null;
  ceo?: string | null;
  aliases?: string[];
  title: string;
  source: string;
  published: string;
  link: string;
  body: string;
};

export type GateKey = { id: string; stratum: string; companyId: number; link: string; sonnet: { yn: string; conf: number; isAbout: number }; jev: number };

export type GateSkip = { id: string; reason: "missing" | "mismatch"; expected: string; found: string | null };

const sameName = (a: string, b: string) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/**
 * 게이트 검토 표본(review-items)과 채점 키(review-key)를 이어 판정 대기열 행으로 만든다. 키가 없는 항목은 버린다.
 * 표본의 기업 id 는 표본을 만든 DB 의 것이다 — 이 DB 에서 이름이 다르거나 없으면 붙이지 않고 알린다.
 */
export function gateEnqueueRows(items: GateItem[], keys: GateKey[], names: Map<number, string>): { rows: EnqueueInput[]; skipped: GateSkip[] } {
  const keyById = new Map(keys.map((key) => [key.id, key]));
  const rows: EnqueueInput[] = [];
  const skipped: GateSkip[] = [];
  for (const item of items) {
    const key = keyById.get(item.id);
    if (!key) continue;
    const found = names.get(key.companyId) ?? null;
    if (found === null || !sameName(found, item.company)) {
      skipped.push({ id: item.id, reason: found === null ? "missing" : "mismatch", expected: item.company, found });
      continue;
    }
    rows.push({
      companyId: key.companyId,
      link: item.link,
      title: item.title,
      source: item.source,
      published: item.published,
      body: item.body,
      origin: "gate",
      setKey: GATE_SET_KEY,
      stratum: key.stratum,
      required: item.required,
      model: { gate: true, sonnet: key.sonnet, jevFirst: key.jev },
    });
  }
  return { rows, skipped };
}

export type JudgmentView = {
  id: number;
  companyId: number;
  companyName: string;
  officialName: string | null;
  industry: string | null;
  ceoName: string | null;
  aliases: string[];
  title: string;
  source: string;
  published: string;
  link: string;
  body: string;
  origin: JudgmentOrigin;
  required: boolean;
  stratum: string | null;
  answer: JudgmentAnswer;
  judged: boolean;
  verdict: string | null;
};

/**
 * 판정 화면에 보낼 모양으로 옮긴다. 분석기의 답(verdict)은 주제 판정이 있을 때만 싣는다 — 판정 전에는 페이로드에도 없다.
 */
export function toJudgmentView(row: JudgmentRow): JudgmentView {
  const judged = row.about !== null;
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    officialName: row.company.officialName,
    industry: row.company.industry,
    ceoName: row.company.ceoName,
    aliases: row.company.aliases,
    title: row.title,
    source: row.source,
    published: row.published,
    link: row.link,
    body: row.body,
    origin: row.origin,
    required: row.required,
    stratum: row.stratum,
    answer: { entity: row.entity, role: row.role, form: row.form, about: row.about, note: row.note },
    judged,
    verdict: judged ? modelVerdict(row.modelJson) : null,
  };
}
