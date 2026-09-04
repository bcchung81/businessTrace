import type { NewsItem } from "@/lib/services/newsTypes";
import { DATA_FENCE_RULE, fenceUntrusted } from "@/lib/services/prompts/untrusted";

export const SYSTEM_NEWS =
  "당신은 뉴스 분석 전문가입니다. 정확하고 객관적으로 뉴스를 분석해주세요. " + DATA_FENCE_RULE;

/**
 * 기사 한 건을 구분자 안에 넣어 낸다 — 제목·출처도 외부 문자열이라 함께 감싼다.
 */
export function newsText(item: NewsItem) {
  return fenceUntrusted(
    "article",
    1,
    [
      `제목 | ${item.title}`,
      `출처 | ${item.source}`,
      `날짜 | ${item.published}`,
      `링크 | ${item.link}`,
      "---",
      item.content,
    ].join("\n"),
  );
}

/**
 * 기사 본문을 캐시 가능한 공유 컨텍스트로 낸다.
 * 동향·수상·투자 세 질문이 같은 본문을 앞에 두면 두 번째부터는 캐시에서 읽는다.
 */
export function newsContext(companyName: string, item: NewsItem) {
  return `다음은 '${companyName}' 회사에 대한 뉴스입니다.
${newsText(item)}`;
}

export function trendPrompt(companyName: string) {
  return `
다음은 '${companyName}' 회사에 대한 뉴스입니다. 이 뉴스의 동향실적을 분석해주세요.

분석 요구사항:
0. 이 기사가 '${companyName}' 회사에 관한 기사인지 먼저 판단해주세요. 회사가 기사의 주제가 아니라 한두 번 언급되기만 했다면 is_about_company 를 "N" 으로 답해주세요.
1. 뉴스의 내용을 요약
2. 긍정/부정 점수 매기기 (-10: 매우 부정적, 0: 중립, 10: 매우 긍정적)
- 긍정/부정 점수는 뉴스 내용의 전반적인 톤과 회사에 미치는 영향을 고려하여 판단해주세요.
점수 기준:
- 8~10: 매우 긍정적 (혁신적 성과, 시장 지배력 확대, 매출/이익 대폭 증가 등)
- 4~7: 긍정적 (성장, 신규 고객·시장 확보, 긍정적 전망 등)
- 1~3: 약간 긍정적 (소폭 개선, 안정적 운영 등)
- 0: 중립 (정보 제공, 사실 전달 등)
- -1~-3: 약간 부정적 (소폭 하락, 경쟁 압박 등)
- -4~-7: 부정적 (실적 악화, 규제 압박, 경쟁 우위 상실 등)
- -8~-10: 매우 부정적 (심각한 위기, 매출 급감, 경영 위기 등)

3. 수상·투자 유치 사실 자체는 감성 점수에 반영하지 마세요 — 별도 문항에서 따로 셉니다. 여기서는 기사가 전하는 사업의 방향만 보세요.
4. about_confidence 는 이 기사가 '${companyName}' 회사를 주제로 다룬다는 확신도입니다 (0~1). 동명의 다른 회사일 수 있거나 스쳐 언급된 정도면 낮게 주세요.
5. 부정적 기사라면 negative_kind 로 종류를 적어주세요 — "lawsuit"(소송·분쟁), "recall"(리콜·품질 사고), "sanction"(규제·제재·과징금), 그 외나 부정적이지 않으면 "none".

뉴스 내용은 앞서 제공한 본문을 그대로 참고하세요.

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{
    "trend_analysis": {
        "is_about_company": "Y" or "N",
        "about_confidence": 0 ~ 1 사이의 소수,
        "news_trend_summary": "뉴스의 내용을 요약한 내용",
        "sentiment_score": -10 ~ 10 사이의 정수,
        "sentiment_label": "매우 긍정적" or "긍정적" or "중립" or "부정적" or "매우 부정적",
        "negative_kind": "lawsuit" or "recall" or "sanction" or "none"
    }
}
`;
}

export function awardPrompt(companyName: string) {
  return `
다음은 '${companyName}' 회사에 대한 뉴스입니다. 이 뉴스에서 수상을 받았는지 찾아주세요. 반드시 '${companyName}' 회사가 직접 받은 수상 받은 수상이어야 합니다.

분석 요구사항:
1. 수상 관련 뉴스인지 판단 (상, 시상, 수상, 어워드, award, prize 등)
2. 수상을 받았으면 구체적인 수상명을 찾아주세요
3. 수상을 받았다고 판단한 이유 설명

뉴스 내용은 앞서 제공한 본문을 그대로 참고하세요.

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{
    "award_analysis": {
        "is_award_related": "Y" or "N",
        "award_name": "구체적인 수상명 (수상 관련이 아닌 경우 빈 문자열)",
        "award_reason": "수상을 받았다고 판단한 이유 설명"
    }
}
`;
}

export function investmentPrompt(companyName: string) {
  return `
다음은 '${companyName}' 회사에 대한 뉴스입니다. 이 뉴스에서 투자 관련 정보를 찾아주세요. 반드시 '${companyName}' 회사가 직접 받거나 포함되어 받은 투자여야 합니다.

분석 요구사항:
1. 투자 관련 뉴스인지 판단 (투자유치, 투자, 펀딩, funding, 시리즈A/B/C, IPO 등)
2. 투자 관련이면 구체적인 투자명이나 투자 유형을 찾아주세요
3. 투자 관련이면 이유 설명

뉴스 내용은 앞서 제공한 본문을 그대로 참고하세요.

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{
    "investment_analysis": {
        "is_investment_related": "Y" or "N",
        "investment_name": "구체적인 투자명이나 투자 유형 (투자 관련이 아닌 경우 빈 문자열)",
        "investment_reason": "투자실적 여부에 대한 이유 설명"
    }
}
`;
}

export type OpinionStats = {
  totalNews: number;
  scoredNews: number;
  averageSentiment: number | null;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  awardCount: number;
  investmentCount: number;
};

export function opinionPrompt(companyName: string, stats: OpinionStats) {
  const excluded = stats.totalNews - stats.scoredNews;

  return `
다음은 '${companyName}' 회사에 대한 뉴스 분석의 정량 결과입니다. 이를 바탕으로 종합분석을 작성해주세요.

수집 뉴스: ${stats.totalNews}건
감성 점수 집계 대상: ${stats.scoredNews}건 (회사가 주제가 아닌 ${excluded}건은 집계에서 제외)
평균 감성 점수: ${stats.averageSentiment ?? "집계 대상 없음"}
긍정 ${stats.positiveCount}건 / 중립 ${stats.neutralCount}건 / 부정 ${stats.negativeCount}건
수상 관련: ${stats.awardCount}건
투자 관련: ${stats.investmentCount}건

작성 요구사항:
1. 위 수치에 근거해서만 작성하고 수치에 없는 사실을 지어내지 마세요
2. 집계에서 제외된 뉴스가 있으면 그 사실을 명시하세요
3. 평가위원회가 읽는 자료이므로 단정적 표현보다 근거를 함께 제시하세요

반드시!!! 다음 JSON 형식으로 응답해주세요. 다른형식으로 응답하면 처리를 할수 없습니다.:
{
    "comprehensive_opinion": "종합분석 본문"
}
`;
}
