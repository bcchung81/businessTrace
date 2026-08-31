import { z } from "zod";
import type { AnalysisResult } from "@/lib/services/analyzer";
import type { LlmClient, Usage } from "@/lib/services/llm";
import { SYSTEM_JUDGE, judgePrompt } from "@/lib/services/prompts/verification";
import {
  checkSources,
  decide,
  evidenceMatch,
  type SourceCheck,
  type VerificationStatus,
} from "@/lib/services/verificationScores";

const judgeSchema = z.object({
  claims: z.array(
    z.object({
      claim: z.string(),
      supported: z.boolean(),
      evidence: z.string(),
    }),
  ),
  counter_evidence: z.array(z.string()),
});

export type JudgeResult = z.infer<typeof judgeSchema>;

export type VerificationOutput = {
  status: VerificationStatus;
  faithfulness: number | null;
  sourceCoverage: number;
  evidenceMatch: number;
  unsupportedClaims: string[];
  counterEvidence: string[];
  usage: Usage;
  detail: {
    layer1: SourceCheck;
    layer2: JudgeResult | null;
    layer3: number;
    error?: string;
  };
};

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

/**
 * 4층 환각 검증을 실행해 판정과 근거를 낸다.
 * judge 실패·거부·파싱 오류는 전부 needs_review 다. 검증 실패는 신뢰 불가를 뜻한다.
 */
export async function verifyAnalysis(
  result: AnalysisResult,
  deps: { llm: LlmClient },
): Promise<VerificationOutput> {
  const layer1 = checkSources(result.analyses);
  const layer3 = evidenceMatch(result.analyses);

  let layer2: JudgeResult | null = null;
  let faithfulness: number | null = null;
  let usage = NO_USAGE;
  let error: string | undefined;

  try {
    const answer = await deps.llm.json({
      system: SYSTEM_JUDGE,
      prompt: judgePrompt(result.companyName, {
        comprehensiveOpinion: result.comprehensiveOpinion,
        analyses: result.analyses,
      }),
      schema: judgeSchema,
      effort: "low",
    });

    layer2 = answer.data;
    usage = answer.usage;
    faithfulness =
      layer2.claims.length === 0
        ? 0
        : layer2.claims.filter((claim) => claim.supported).length / layer2.claims.length;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const status = error
    ? "failed"
    : decide({
        faithfulness,
        sourceCoverage: layer1.coverage,
        evidenceMatch: layer3,
      });

  return {
    status,
    faithfulness,
    sourceCoverage: layer1.coverage,
    evidenceMatch: layer3,
    unsupportedClaims: (layer2?.claims ?? [])
      .filter((claim) => !claim.supported)
      .map((claim) => claim.claim),
    counterEvidence: layer2?.counter_evidence ?? [],
    usage,
    detail: { layer1, layer2, layer3, ...(error ? { error } : {}) },
  };
}
