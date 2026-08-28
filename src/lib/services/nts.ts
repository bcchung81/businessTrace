const STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";
const ACTIVE_STATUS_CODE = "01";
const REQUEST_TIMEOUT_MS = 10000;

export type BusinessStatus = {
  checked: boolean;
  isActive: boolean | null;
  businessNo: string;
  statusCode?: string;
  status?: string;
  taxType?: string;
  closedAt?: string;
  reason?: string;
};

/**
 * 하이픈 등을 걷어내고 10자리 사업자번호만 남긴다.
 * 형식이 맞지 않으면 null 이다. 호출 전에 걸러 불필요한 API 호출을 막는다.
 */
export function normaliseBusinessNo(raw: string) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/**
 * 국세청에 사업자등록 상태를 조회해 계속사업자인지 판정한다.
 * 조회 실패는 폐업이 아니라 미확인(checked=false)이다. 실패를 부적격으로 읽으면 안 된다.
 */
export async function checkBusinessStatus(
  rawBusinessNo: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<BusinessStatus> {
  const businessNo = normaliseBusinessNo(rawBusinessNo);
  if (!businessNo) {
    return {
      checked: false,
      isActive: null,
      businessNo: rawBusinessNo,
      reason: "사업자번호는 숫자 10자리여야 합니다.",
    };
  }

  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) {
    return { checked: false, isActive: null, businessNo, reason: "NTS_SERVICE_KEY 가 설정되지 않았습니다." };
  }

  const url = new URL(STATUS_URL);
  url.searchParams.set("serviceKey", serviceKey);

  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b_no: [businessNo] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { checked: false, isActive: null, businessNo, reason: `국세청 응답 ${response.status}` };
    }

    const body = (await response.json()) as { data?: Array<Record<string, string>> };
    const entry = body.data?.[0];
    if (!entry) {
      return { checked: false, isActive: null, businessNo, reason: "국세청 응답에 조회 결과가 없습니다." };
    }

    if (!entry.b_stt_cd) {
      return {
        checked: false,
        isActive: null,
        businessNo,
        taxType: entry.tax_type,
        reason: entry.tax_type || "국세청에 등록되지 않은 사업자등록번호입니다.",
      };
    }

    return {
      checked: true,
      isActive: entry.b_stt_cd === ACTIVE_STATUS_CODE,
      businessNo,
      statusCode: entry.b_stt_cd,
      status: entry.b_stt,
      taxType: entry.tax_type,
      ...(entry.end_dt ? { closedAt: entry.end_dt } : {}),
    };
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
    return { checked: false, isActive: null, businessNo, reason: `국세청 조회 실패: ${reason}` };
  }
}
