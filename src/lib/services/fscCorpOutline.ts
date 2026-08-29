const OUTLINE_URL =
  "https://apis.data.go.kr/1160100/service/GetCorpBasicInfoService_V2/getCorpOutline_V2";
const REQUEST_TIMEOUT_MS = 15000;

export type CorpOutline = {
  found: boolean;
  corpName?: string;
  businessNo?: string;
  corporateNo?: string;
  establishedAt?: string;
  employeeCount: number | null;
  mainBusiness?: string;
  address?: string;
  isSmallBusiness?: boolean;
  failed?: boolean;
  reason?: string;
};

type OutlineRow = Record<string, string>;

function normaliseName(value: string) {
  return value.replace(/\s|\(주\)|주식회사|㈜/g, "");
}

function pickBestMatch(rows: OutlineRow[], companyName: string) {
  const wanted = normaliseName(companyName);
  const exact = rows.find((row) => normaliseName(row.corpNm ?? "") === wanted);
  return exact ?? rows.find((row) => normaliseName(row.corpNm ?? "").includes(wanted));
}

function readRows(body: unknown): OutlineRow[] {
  const items = (body as { response?: { body?: { items?: unknown } } })?.response?.body?.items;
  if (Array.isArray(items)) return items as OutlineRow[];
  const nested = (items as { item?: unknown })?.item;
  if (Array.isArray(nested)) return nested as OutlineRow[];
  return nested ? [nested as OutlineRow] : [];
}

/**
 * 금융위 기업기본정보에서 사업자번호·법인번호·종업원수를 찾는다.
 * DART 미등록 기업의 사업자번호를 여기서 얻으면 국세청·나라장터 대조가 열린다.
 */
export async function lookupCorpOutline(
  companyName: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<CorpOutline> {
  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) {
    return { found: false, employeeCount: null, reason: "NTS_SERVICE_KEY 가 설정되지 않았습니다." };
  }

  const url = new URL(OUTLINE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("corpNm", companyName);
  url.searchParams.set("numOfRows", "50");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("resultType", "json");

  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { found: false, employeeCount: null, failed: true, reason: `금융위 응답 ${response.status}` };
    }

    const match = pickBestMatch(readRows(await response.json()), companyName);
    if (!match) {
      return { found: false, employeeCount: null, reason: "금융위 기업기본정보에서 찾지 못했습니다." };
    }

    const employeeCount = Number(match.enpEmpeCnt ?? "");

    return {
      found: true,
      corpName: match.corpNm,
      businessNo: match.bzno || undefined,
      corporateNo: match.crno || undefined,
      establishedAt: match.enpEstbDt || undefined,
      employeeCount: Number.isFinite(employeeCount) && employeeCount > 0 ? employeeCount : null,
      mainBusiness: match.enpMainBizNm || undefined,
      address: match.enpBsadr || undefined,
      isSmallBusiness: match.smenpYn ? match.smenpYn === "Y" : undefined,
    };
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
    return { found: false, employeeCount: null, failed: true, reason: `금융위 조회 실패: ${reason}` };
  }
}
