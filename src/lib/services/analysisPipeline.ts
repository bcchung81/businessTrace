import { completeRun, createRun, failRun } from "@/lib/repositories/analysisRun";
import { saveVerification } from "@/lib/repositories/verificationResult";
import { analyzeCompany, type AnalysisResult, type AnalyzeEvent } from "@/lib/services/analyzer";
import { defaultLlmClient, resolveModel, type Usage } from "@/lib/services/llm";
import type { NewsItem } from "@/lib/services/newsTypes";
import { verifyAnalysis, type VerificationOutput } from "@/lib/services/verification";

export type PipelineEvent =
  | AnalyzeEvent
  | { type: "verifying"; runId: number }
  | { type: "verified"; runId: number; verification: VerificationOutput }
  | { type: "verification_failed"; runId: number; message: string };

export type PipelineDeps = {
  model: string;
  analyze: (name: string, news: NewsItem[], deps: { model: string }) => AsyncGenerator<AnalyzeEvent>;
  verify: (result: AnalysisResult) => Promise<VerificationOutput>;
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

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  };
}

/**
 * 실제 LLM 으로 분석·검증하는 기본 의존성.
 */
export function defaultPipelineDeps(model = resolveModel()): PipelineDeps {
  const llm = defaultLlmClient();
  return {
    model,
    analyze: (name, news, deps) => analyzeCompany(name, news, { llm, model: deps.model }),
    verify: (result) => verifyAnalysis(result, { llm }),
  };
}

/**
 * 수집된 뉴스로 분석 → 검증 → 저장을 한 번에 돈다. SSE 라우트와 배치 스크립트가 같은 경로를 쓴다.
 * 검증 실패는 실행 실패가 아니다 — 분석은 남기고 판정만 비운다. 소비자가 떠나면 실행을 실패로 닫는다.
 */
export async function runCompanyAnalysis(
  input: { company: { id: number; name: string }; userId: number; news: NewsItem[] },
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const run = await createRun({ companyId: input.company.id, userId: input.userId, model: deps.model, news: input.news });
  const emit = (event: PipelineEvent) => deps.onEvent?.(event);
  const open = () => deps.isOpen?.() ?? true;
  let usage = NO_USAGE;

  try {
    for await (const event of deps.analyze(input.company.name, input.news, { model: deps.model })) {
      if (!open()) {
        await failRun(run.id, "클라이언트가 연결을 끊었습니다.");
        return { runId: run.id, status: "aborted", usage };
      }
      if (event.type !== "complete") {
        emit(event);
        continue;
      }

      await completeRun(run.id, event.result);
      usage = addUsage(usage, event.result.usage);
      emit({ ...event, runId: run.id });
      if (event.result.stats.scoredNews === 0) return { runId: run.id, status: "no_news", usage };

      emit({ type: "verifying", runId: run.id });
      try {
        const verification = await deps.verify(event.result);
        await saveVerification(run.id, verification);
        usage = addUsage(usage, verification.usage);
        emit({ type: "verified", runId: run.id, verification });
        return { runId: run.id, status: verification.status, usage };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
        emit({ type: "verification_failed", runId: run.id, message });
        return { runId: run.id, status: "verification_failed", message, usage };
      }
    }
    await failRun(run.id, "분석이 결과 없이 끝났습니다.");
    return { runId: run.id, status: "failed", message: "분석이 결과 없이 끝났습니다.", usage };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "알 수 없는 오류";
    await failRun(run.id, message);
    return { runId: run.id, status: "failed", message, usage };
  }
}
