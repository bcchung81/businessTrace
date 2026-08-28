import { normaliseBusinessNo } from "@/lib/services/nts";

const PROCUREMENT_URL =
  "https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02";
const BY_BUSINESS_NO = "3";
const REQUEST_TIMEOUT_MS = 10000;

export type ProcurementProfile = {
  found: boolean;
  businessNo: string;
  corpName?: string;
  ceoName?: string;
  address?: string;
  phone?: string;
  homepage?: string;
  openedAt?: string;
  employeeCount: number | null;
  businessDivision?: string;
  manufacturingDivision?: string;
  reason?: string;
};

type ApiBody = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { totalCount?: number; items?: Array<Record<string, string>> };
  };
};

function explainResultCode(code: string, message: string) {
  if (message.includes("NO_OPENAPI_SERVICE_ERROR")) {
    return "조달청 서비스 경로가 맞지 않습니다. 미구독이 아니라 경로 불일치입니다.";
  }
  if (message.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return "조달청 API 미구독 상태입니다.";
  }
  return `조달청 응답 ${code}: ${message}`;
}

function parseEmployeeCount(raw: string | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/**
 * 사업자번호로 나라장터 조달업체 프로파일을 조회한다.
 * 업체명 역검색은 지원하지 않으므로 DART 로 사업자번호를 확보한 뒤에만 쓸 수 있다.
 */
export async function getProcurementProfile(
  rawBusinessNo: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<ProcurementProfile> {
  const businessNo = normaliseBusinessNo(rawBusinessNo);
  if (!businessNo) {
    return {
      found: false,
      businessNo: rawBusinessNo,
      employeeCount: null,
      reason: "사업자번호는 숫자 10자리여야 합니다.",
    };
  }

  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) {
    return {
      found: false,
      businessNo,
      employeeCount: null,
      reason: "NTS_SERVICE_KEY 가 설정되지 않았습니다.",
    };
  }

  const url = new URL(PROCUREMENT_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("inqryDiv", BY_BUSINESS_NO);
  url.searchParams.set("bizno", businessNo);
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("type", "json");

  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { found: false, businessNo, employeeCount: null, reason: `조달청 응답 ${response.status}` };
    }

    const body = (await response.json()) as ApiBody;
    const header = body.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      return {
        found: false,
        businessNo,
        employeeCount: null,
        reason: explainResultCode(header.resultCode, header.resultMsg ?? ""),
      };
    }

    const entry = body.response?.body?.items?.[0];
    if (!entry) {
      return {
        found: false,
        businessNo,
        employeeCount: null,
        reason: "조달청에 등록되지 않은 업체입니다.",
      };
    }

    return {
      found: true,
      businessNo,
      corpName: entry.corpNm,
      ceoName: entry.ceoNm,
      address: entry.adrs,
      phone: entry.telNo,
      homepage: entry.hmpgAdrs,
      openedAt: entry.opbizDt,
      employeeCount: parseEmployeeCount(entry.emplyeNum),
      businessDivision: entry.corpBsnsDivNm,
      manufacturingDivision: entry.mnfctDivNm,
    };
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
    return { found: false, businessNo, employeeCount: null, reason: `조달청 조회 실패: ${reason}` };
  }
}
