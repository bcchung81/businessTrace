import { completeRun, createRun, failRun } from "@/lib/repositories/analysisRun";
import { enqueueJudgments, judgmentOverrides, type EnqueueInput } from "@/lib/repositories/articleJudgment";
import { upsertEvents } from "@/lib/repositories/eventRepository";
import { saveVerification } from "@/lib/repositories/verificationResult";
import { analyzeCompany, type AnalysisResult, type AnalyzeEvent, type NewsAnalysis } from "@/lib/services/analyzer";
import { applyJudgments, heldEnqueueRows } from "@/lib/services/judgments";
import { extractAnalysisEvents, type NewEvent } from "@/lib/services/eventRules";
import { defaultLlmClient, resolveModel, type Usage } from "@/lib/services/llm";
import { resolveProvider } from "@/lib/services/llmProvider";
import { resolveAnalyzer, type AnalyzerKind } from "@/lib/services/analyzerChoice";
import { analyzeCompanyWithJev, type CompanyProfile } from "@/lib/services/jevAnalyzer";
import { DEFAULT_JEV_MODEL, defaultJevClient } from "@/lib/services/typesafe";
import { findCompanyIdentity } from "@/lib/repositories/companyRepository";
import { parseAliases } from "@/lib/services/collectForCompany";
import { logEvent } from "@/lib/services/logger";
import type { NewsItem } from "@/lib/services/newsTypes";
import { verifyAnalysis, type VerificationOutput } from "@/lib/services/verification";
import { listSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { buildCompanyFacts } from "@/lib/services/companyFacts";
import { publicFactLines } from "@/lib/services/publicFacts";

export type PipelineEvent =
  | AnalyzeEvent
  | { type: "verifying"; runId: number }
  | { type: "verified"; runId: number; verification: VerificationOutput }
  | { type: "verification_failed"; runId: number; message: string }
  | { type: "events_failed"; runId: number; message: string };

export type PipelineDeps = {
  model: string;
  /** 실행 기록에 남길 분석 경로 — 없으면 스키마 기본값. */
  formulaVersion?: string;
  analyze: (name: string, news: NewsItem[], deps: { model: string; facts?: string[]; profile?: CompanyProfile; forceAbout?: ReadonlySet<string> }) => AsyncGenerator<AnalyzeEvent>;
  verify: (result: AnalysisResult) => Promise<VerificationOutput>;
  /** 기업의 공공데이터 사실을 한 줄씩 낸다 — 없으면 종합의견은 뉴스 통계만 본다. */
  loadFacts?: (companyId: number) => Promise<string[]>;
  /** 동명 타사를 가리는 데 쓸 회사 식별 정보 — 두 분석기가 모두 쓴다. */
  loadProfile?: (companyId: number) => Promise<CompanyProfile | null>;
  persistEvents?: (events: NewEvent[]) => Promise<unknown>;
  /** 사람 판정 — "주제 아님" 링크는 분석에서 빼고 "주제" 링크는 주제로 강제한다. */
  loadJudgments?: (companyId: number) => Promise<{ exclude: string[]; include: string[] }>;
  /** 분석기가 보류한 기사를 판정 대기열에 올린다. */
  enqueueHeld?: (rows: EnqueueInput[]) => Promise<unknown>;
  onEvent?: (event: PipelineEvent) => void;
  isOpen?: () => boolean;
};

export type PipelineOutcome = {
  runId: number;
  status: "verified" | "needs_review" | "no_news" | "verification_failed" | "failed" | "aborted";
  message?: string;
  usage: Usage;
};

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
const NO_JUDGMENTS = { exclude: [] as string[], include: [] as string[] };

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

/**
 * 어느 분석기로 판정하고 실행 기록에 무엇을 적을지 정한다. 기록은 실제로 부른 모델이어야 한다.
 * Jev 경로는 판정은 Jev, 종합의견·검증은 LLM 이라 두 모델을 함께 적는다.
 */
export function analysisPath(llmModel: string, env: Record<string, string | undefined> = process.env): { analyzer: AnalyzerKind; model: string; formulaVersion: string } {
  const analyzer = resolveAnalyzer(env);
  if (analyzer === "jev") return { analyzer, model: `${env.TYPESAFE_MODEL?.trim() || DEFAULT_JEV_MODEL}+${llmModel}`, formulaVersion: "v3-jev" };
  return { analyzer, model: llmModel, formulaVersion: `v2-${resolveProvider(env)}` };
}

/**
 * 실제 LLM(과 ANALYZER=jev 면 Jev)으로 분석·검증하는 기본 의존성.
 */
export function defaultPipelineDeps(model = resolveModel()): PipelineDeps {
  const llm = defaultLlmClient();
  const path = analysisPath(model);
  const jev = path.analyzer === "jev" ? defaultJevClient() : null;
  return {
    model: path.model,
    formulaVersion: path.formulaVersion,
    analyze: (name, news, deps) =>
      jev
        ? analyzeCompanyWithJev(name, news, { jev, llm, model: deps.model, facts: deps.facts, profile: deps.profile })
        : analyzeCompany(name, news, { llm, model: deps.model, facts: deps.facts, profile: deps.profile }),
    verify: (result) => verifyAnalysis(result, { llm }),
    persistEvents: upsertEvents,
    loadFacts: async (companyId) => publicFactLines(buildCompanyFacts({ businessNo: null, snapshots: await listSourceSnapshots(companyId) })),
    loadJudgments: judgmentOverrides,
    enqueueHeld: enqueueJudgments,
    loadProfile: async (companyId) => {
      const row = await findCompanyIdentity(companyId);
      return row ? { name: row.name, officialName: row.officialName, industry: row.industry, ceoName: row.ceoName, aliases: parseAliases(row.aliases) } : null;
    },
  };
}

function emptyResult(companyName: string, model: string, total: number): AnalysisResult {
  return {
    companyName,
    model,
    analyses: [],
    comprehensiveOpinion: "회사가 주제인 기사가 없어 분석하지 않았습니다.",
    stats: { totalNews: total, scoredNews: 0, excludedNews: total, averageSentiment: null, positiveCount: 0, negativeCount: 0, neutralCount: 0, awardCount: 0, investmentCount: 0 },
    usage: NO_USAGE,
    fallbacks: 0,
  };
}

type Clock = { started: number; analyzed: number | null; verified: number | null };

const elapsed = (from: number, to: number | null) => (to === null ? null : Math.round(to - from));

/**
 * 수집된 뉴스 중 회사가 주제인 기사만 분석 → 검증 → 저장한다. SSE 라우트와 배치 스크립트가 같은 경로를 쓴다.
 * 스쳐 언급된 기사까지 LLM 에 넣으면 토큰만 태우고 동명 일반명사 기업의 판정을 흐린다.
 * 끝나면 분석·검증 소요를 `analysis.timing` 로그로 남긴다 — 지연 개선의 기준선이다.
 */
export async function runCompanyAnalysis(
  input: { company: { id: number; name: string }; userId: number; news: NewsItem[]; duplicatesRemoved?: number },
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const clock: Clock = { started: performance.now(), analyzed: null, verified: null };
  const outcome = await analyseAndVerify(input, deps, clock);
  logEvent("info", "analysis.timing", {
    companyId: input.company.id,
    runId: outcome.runId,
    status: outcome.status,
    articles: input.news.filter((item) => item.relevance === "primary").length,
    analyzeMs: elapsed(clock.started, clock.analyzed),
    verifyMs: clock.analyzed === null ? null : elapsed(clock.analyzed, clock.verified),
  });
  return outcome;
}

/**
 * 보류 기사를 판정 대기열에 올린다. 적재가 실패해도 분석·검증은 멈추지 않는다 — 대기열은 부가 기능이다.
 */
async function queueHeld(deps: PipelineDeps, companyId: number, run: { id: number; formulaVersion: string }, analyses: NewsAnalysis[]) {
  if (!deps.enqueueHeld) return;
  const rows = heldEnqueueRows({ companyId, runId: run.id, formulaVersion: run.formulaVersion, analyses });
  if (rows.length === 0) return;
  try {
    await deps.enqueueHeld(rows);
  } catch (error) {
    logEvent("warn", "analysis.held_queue_failed", { companyId, runId: run.id, error });
  }
}

async function analyseAndVerify(
  input: { company: { id: number; name: string }; userId: number; news: NewsItem[]; duplicatesRemoved?: number },
  deps: PipelineDeps,
  clock: Clock,
): Promise<PipelineOutcome> {
  const run = await createRun({
    companyId: input.company.id,
    userId: input.userId,
    model: deps.model,
    news: input.news,
    duplicatesRemoved: input.duplicatesRemoved,
    formulaVersion: deps.formulaVersion,
  });
  const emit = (event: PipelineEvent) => deps.onEvent?.(event);
  const open = () => deps.isOpen?.() ?? true;
  const persistEvents = deps.persistEvents ?? upsertEvents;
  let usage = NO_USAGE;
  let analyseError: string | null = null;

  const overrides = deps.loadJudgments
    ? await deps.loadJudgments(input.company.id).catch((error: unknown) => {
        logEvent("warn", "analysis.judgments_unavailable", { companyId: input.company.id, error });
        return NO_JUDGMENTS;
      })
    : NO_JUDGMENTS;
  const judged = applyJudgments(input.news, overrides);
  const primary = judged.news.filter((item) => item.relevance === "primary");
  if (primary.length === 0) {
    const result = emptyResult(input.company.name, deps.model, input.news.length);
    await completeRun(run.id, result);
    emit({ type: "complete", runId: run.id, result });
    return { runId: run.id, status: "no_news", usage };
  }

  const facts = deps.loadFacts ? await deps.loadFacts(input.company.id).catch(() => []) : [];
  const profile = deps.loadProfile ? ((await deps.loadProfile(input.company.id).catch(() => null)) ?? undefined) : undefined;

  try {
    for await (const event of deps.analyze(input.company.name, primary, { model: deps.model, facts, profile, forceAbout: judged.forceAbout })) {
      if (!open()) {
        await failRun(run.id, "클라이언트가 연결을 끊었습니다.");
        return { runId: run.id, status: "aborted", usage };
      }
      if (event.type !== "complete") {
        if (event.type === "error") analyseError = event.message;
        emit(event);
        continue;
      }

      clock.analyzed = performance.now();
      await completeRun(run.id, event.result);
      await queueHeld(deps, input.company.id, run, event.result.analyses);
      usage = addUsage(usage, event.result.usage);
      const partial = event.result.fallbacks > 0 ? { message: `LLM 응답 실패 ${event.result.fallbacks}건을 기본값으로 메움` } : {};
      if (event.result.fallbacks > 0) {
        logEvent("warn", "analysis.fallbacks", { companyId: input.company.id, runId: run.id, fallbacks: event.result.fallbacks });
      }
      emit({ ...event, runId: run.id });
      if (event.result.stats.scoredNews === 0) return { runId: run.id, status: "no_news", usage };

      emit({ type: "verifying", runId: run.id });
      let verification: VerificationOutput;
      try {
        verification = await deps.verify(event.result);
        clock.verified = performance.now();
        await saveVerification(run.id, verification);
        usage = addUsage(usage, verification.usage);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
        emit({ type: "verification_failed", runId: run.id, message });
        return { runId: run.id, status: "verification_failed", message, usage };
      }

      if (verification.status === "failed") {
        const message = (verification.detail as { error?: string }).error ?? "검증 판정을 얻지 못했습니다.";
        emit({ type: "verification_failed", runId: run.id, message });
        return { runId: run.id, status: "verification_failed", message, usage };
      }

      emit({ type: "verified", runId: run.id, verification });

      try {
        await persistEvents(extractAnalysisEvents({ companyId: input.company.id, runId: run.id, result: event.result, trust: verification.status }));
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
        emit({ type: "events_failed", runId: run.id, message });
      }

      return { runId: run.id, status: verification.status, ...partial, usage };
    }
    const message = analyseError ?? "분석이 결과 없이 끝났습니다.";
    await failRun(run.id, message);
    logEvent("error", "analysis.failed", { companyId: input.company.id, runId: run.id, message });
    return { runId: run.id, status: "failed", message, usage };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
    await failRun(run.id, message);
    logEvent("error", "analysis.threw", { companyId: input.company.id, runId: run.id, error: caught });
    return { runId: run.id, status: "failed", message, usage };
  }
}
