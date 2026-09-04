import { ROUND_LABEL, eokLabel, type NewsAnalysis } from "@/lib/services/analyzer";
import { DATA_FENCE_RULE, fenceUntrusted } from "@/lib/services/prompts/untrusted";

export const SYSTEM_JUDGE =
  "당신은 AI 분석 결과를 원문과 대조하는 검증 심사관입니다. 새로운 분석을 하지 말고, 주어진 기사에 근거가 있는지만 판정하세요. " +
  DATA_FENCE_RULE;

/**
 * 기사 원문을 구분자 안에 넣어 낸다 — 제목·출처까지 전부 외부에서 온 문자열이라 함께 감싼다.
 * 번호는 코드가 붙인다. 본문이 자기 번호를 주장하면 없는 근거를 만들 수 있다.
 */
function sourceBlock(analyses: NewsAnalysis[]) {
  return analyses
    .map((analysis, index) =>
      [
        `[기사 ${index + 1}]`,
        fenceUntrusted(
          "article",
          index + 1,
          [
            `제목 | ${analysis.news.title}`,
            `출처 | ${analysis.news.source}`,
            `링크 | ${analysis.news.link}`,
            "---",
            analysis.news.content,
          ].join("\n"),
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

function claimBlock(analyses: NewsAnalysis[], comprehensiveOpinion: string) {
  const perArticle = analyses.flatMap((analysis, index) => {
    const position = index + 1;
    const claims = [`[주장 ${position}-요약] ${analysis.trend.news_trend_summary}`];

    if (analysis.award.is_award_related === "Y") {
      claims.push(`[주장 ${position}-수상] ${analysis.award.award_name}: ${analysis.award.award_reason}`);
    }
    if (analysis.investment.is_investment_related === "Y") {
      const { investment_round: round, investment_amount_krw: amount } = analysis.investment;
      // 라운드·금액도 주장이다 — 기사에 없는 금액이면 여기서 불지지로 잡힌다.
      const label = [ROUND_LABEL[round ?? "none"] || analysis.investment.investment_name, eokLabel(amount) ? `${eokLabel(amount)}원` : ""].filter(Boolean).join(" · ");
      claims.push(`[주장 ${position}-투자] ${label}: ${analysis.investment.investment_reason}`);
    }
    for (const signal of analysis.trend.growth_signals ?? []) {
      claims.push(`[주장 ${position}-성장] ${signal}`);
    }
    return claims;
  });

  return [...perArticle, `[주장 종합] ${comprehensiveOpinion}`].join("\n");
}

/**
 * 판정 프롬프트. facts 는 코드가 공공데이터에서 계산해 종합의견에 넘긴 사실들이다.
 * judge 에게 같은 것을 보여 주지 않으면 종합의견이 사실을 인용할수록 "기사에 없다" 로 불지지가 늘어 검증이 스스로를 벌한다.
 */
export function judgePrompt(
  companyName: string,
  input: { comprehensiveOpinion: string; analyses: NewsAnalysis[]; facts?: string[] },
) {
  const facts = input.facts ?? [];
  const factBlock = facts.length === 0 ? "" : `
=== 공식 원천 사실 ===
${facts.map((line) => `- ${line}`).join("\n")}
`;
  const factRule = facts.length === 0 ? "" : `
5. [주장 종합] 이 위 공식 원천 사실을 인용한 부분은 코드가 공공데이터에서 준 값이므로 기사에 없어도 supported 로 하고 evidence 에 그 사실 줄을 적으세요. 단, 공식 원천 사실에도 기사에도 없는 수치는 여전히 false 입니다.`;

  return `
'${companyName}' 회사에 대한 AI 분석 결과를 아래 기사 원문과 대조해 검증해주세요.

=== 기사 원문 ===
${sourceBlock(input.analyses)}
${factBlock}
=== 검증할 주장 ===
${claimBlock(input.analyses, input.comprehensiveOpinion)}

판정 규칙:
1. 각 주장이 위 기사 원문으로 뒷받침되는지 판정하세요. 기사에 없는 내용이면 당신이 알고 있더라도 supported 를 false 로 하세요.
2. supported 가 true 이면 근거가 되는 기사 문장을 evidence 에 그대로 인용하세요.
3. [주장 종합] 안의 평균 감성 점수·긍정/부정 건수·수상/투자 건수 같은 집계 수치는 AI 산출물이라 기사에 있을 수 없습니다. 수치는 대조하지 말고 종합의 서술 부분만 기사와 대조하세요.
4. counter_evidence 에는 기사 내용과 실제로 모순되는 사실만 적으세요. 출처 편향, 보도자료 의존, 표본 크기, 중복 보도 같은 유의사항은 적지 마세요. 모순이 없으면 빈 배열로 두세요.${factRule}

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{
    "claims": [
        {
            "claim": "검증한 주장",
            "supported": true or false,
            "evidence": "근거가 된 기사 문장 (없으면 빈 문자열)"
        }
    ],
    "counter_evidence": ["이 평가가 틀릴 수 있는 이유"]
}
`;
}
