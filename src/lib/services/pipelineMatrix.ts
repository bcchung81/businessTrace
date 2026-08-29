export type MatrixStage = {
  key: string;
  label: string;
  short: string;
  purpose: string;
  endpoint: string;
};

/** 충돌로 셀 수 있는 원천 단계. 분석·검증은 원천 대조가 아니라 판정이라 제외한다. */
export const CONFLICT_STAGES = ["nts", "nps", "narajangteo", "venture", "dart", "dartFinance", "fsc"] as const;

/**
 * 셀 상태에서 실제로 충돌인 원천 단계만 골라낸다.
 * `verify` 처럼 판정 셀이 conflict 상태를 빌려 쓰는 경우까지 충돌로 세지 않도록 원천 목록으로 좁힌다.
 */
const CONFLICT_STAGE_SET: ReadonlySet<string> = new Set(CONFLICT_STAGES);

export function conflictStages(cells: Record<string, { state: string }>): string[] {
  return Object.keys(cells).filter((stage) => CONFLICT_STAGE_SET.has(stage) && cells[stage].state === "conflict");
}

/** 싼 단계가 앞, 호출 비용이 드는 단계가 뒤다. 왼쪽이 채워지지 않으면 오른쪽은 채울 수 없다. */
export const MATRIX_STAGES: MatrixStage[] = [
  {
    key: "news",
    label: "뉴스 수집",
    short: "뉴스",
    purpose: "네이버 뉴스 + 구글 RSS — 분석의 원재료",
    endpoint: "naverapihub.apigw.ntruss.com · news.google.com/rss",
  },
  {
    key: "nts",
    label: "국세청 휴폐업",
    short: "국세청",
    purpose: "계속사업자·과세유형 — 존속성 게이트",
    endpoint: "api.odcloud.kr/api/nts-businessman/v1/status",
  },
  {
    key: "nps",
    label: "국민연금 가입 사업장",
    short: "연금",
    purpose: "고용 규모 12개월·인건비 추정",
    endpoint: "apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2",
  },
  {
    key: "narajangteo",
    label: "나라장터 조달업체",
    short: "조달",
    purpose: "종업원수·조달업무구분·개업일",
    endpoint: "apis.data.go.kr/1230000/ao/UsrInfoService02",
  },
  {
    key: "venture",
    label: "중기부 벤처확인",
    short: "벤처",
    purpose: "벤처 유형·유효기간 — 재무 요건의 제3자 증명",
    endpoint: "api.odcloud.kr/api/15084581/v1",
  },
  {
    key: "dart",
    label: "OpenDART 기업개황",
    short: "DART",
    purpose: "사업자번호·대표자·업종",
    endpoint: "opendart.fss.or.kr/api/company.json",
  },
  {
    key: "dartFinance",
    label: "OpenDART 재무",
    short: "재무",
    purpose: "매출·영업이익·순이익·자산총계",
    endpoint: "opendart.fss.or.kr/api/fnlttSinglAcnt.json",
  },
  {
    key: "fsc",
    label: "금융위 기업기본정보",
    short: "금융위",
    purpose: "DART 미등록 기업의 사업자번호 폴백",
    endpoint: "apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2",
  },
  {
    key: "llm",
    label: "Anthropic 분석",
    short: "분석",
    purpose: "동향·수상·투자 판정과 종합의견",
    endpoint: "api.anthropic.com/v1/messages",
  },
  {
    key: "verify",
    label: "환각 검증",
    short: "검증",
    purpose: "3게이트 — 출처·근거충실도·근거일치",
    endpoint: "api.anthropic.com/v1/messages (judge)",
  },
];
