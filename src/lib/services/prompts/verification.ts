import type { NewsAnalysis } from "@/lib/services/analyzer";

export const SYSTEM_JUDGE =
  "당신은 AI 분석 결과를 원문과 대조하는 검증 심사관입니다. 새로운 분석을 하지 말고, 주어진 기사에 근거가 있는지만 판정하세요.";

function sourceBlock(analyses: NewsAnalysis[]) {
  return analyses
    .map((analysis, index) =>
      [
        `[기사 ${index + 1}]`,
        `제목: ${analysis.news.title}`,
        `출처: ${analysis.news.source}`,
        `링크: ${analysis.news.link}`,
        `본문: ${analysis.news.content}`,
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
      claims.push(
        `[주장 ${position}-투자] ${analysis.investment.investment_name}: ${analysis.investment.investment_reason}`,
      );
    }
    return claims;
  });

  return [...perArticle, `[주장 종합] ${comprehensiveOpinion}`].join("\n");
}

export function judgePrompt(
  companyName: string,
  input: { comprehensiveOpinion: string; analyses: NewsAnalysis[] },
) {
  return `
'${companyName}' 회사에 대한 AI 분석 결과를 아래 기사 원문과 대조해 검증해주세요.

=== 기사 원문 ===
${sourceBlock(input.analyses)}

=== 검증할 주장 ===
${claimBlock(input.analyses, input.comprehensiveOpinion)}

판정 규칙:
1. 각 주장이 위 기사 원문으로 뒷받침되는지 판정하세요. 기사에 없는 내용이면 당신이 알고 있더라도 supported 를 false 로 하세요.
2. supported 가 true 이면 근거가 되는 기사 문장을 evidence 에 그대로 인용하세요.
3. [주장 종합] 안의 평균 감성 점수·긍정/부정 건수·수상/투자 건수 같은 집계 수치는 AI 산출물이라 기사에 있을 수 없습니다. 수치는 대조하지 말고 종합의 서술 부분만 기사와 대조하세요.
4. counter_evidence 에는 기사 내용과 실제로 모순되는 사실만 적으세요. 출처 편향, 보도자료 의존, 표본 크기, 중복 보도 같은 유의사항은 적지 마세요. 모순이 없으면 빈 배열로 두세요.

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
