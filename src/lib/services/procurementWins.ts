import { KST_OFFSET_MS } from "@/lib/services/kst";
import { normaliseCompanyName } from "@/lib/services/ventureCertification";
import { normaliseBusinessNo } from "@/lib/services/nts";

const SCAN_URL = "https://apis.data.go.kr/1230000/as/ScsbidInfoService";
const OPERATION = { 물품: "getScsbidListSttusThngPPSSrch", 용역: "getScsbidListSttusServcPPSSrch" } as const;
const PAGE_SIZE = 999;
const MAX_PAGES = 200;
const REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_PAUSE_MS = 700;
const DEFAULT_RETRIES = 4;

function pause(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export type AwardCategory = keyof typeof OPERATION;

export type ProcurementAward = {
  awardKey: string;
  bidNoticeNo: string;
  category: AwardCategory;
  title: string;
  winnerName: string;
  winnerBusinessNo: string | null;
  amount: number | null;
  awardedAt: string | null;
  agency: string | null;
};

export type ScanResult = { awards: ProcurementAward[]; scanned: number; failed?: boolean; reason?: string };
export type AwardMatch = { companyId: number; matchedBy: "bizno" | "name"; award: ProcurementAward };
export type MatchTarget = { id: number; name: string; businessNo: string | null };

type ApiBody = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { totalCount?: number; items?: Array<Record<string, string>> | { item?: unknown } };
  };
};

function explainResultCode(code: string, message: string) {
  if (message.includes("NO_OPENAPI_SERVICE_ERROR")) {
    return "조달청 서비스 경로가 맞지 않습니다. 낙찰은 as/ 접두사입니다 — 미구독이 아니라 경로 불일치입니다.";
  }
  if (message.includes("SERVICE_KEY_IS_NOT_REGISTERED")) {
    return "조달청 API 미구독 상태입니다.";
  }
  return `조달청 응답 ${code}: ${message}`;
}

function itemsOf(body: ApiBody) {
  const raw = body.response?.body?.items;
  if (Array.isArray(raw)) return raw;
  const nested = (raw as { item?: unknown })?.item;
  if (Array.isArray(nested)) return nested as Array<Record<string, string>>;
  return nested ? [nested as Record<string, string>] : [];
}

function toDate(raw: string | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function toAmount(raw: string | undefined) {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function toAward(row: Record<string, string>, category: AwardCategory): ProcurementAward {
  const notice = row.bidNtceNo ?? "";
  return {
    awardKey: [notice, row.bidNtceOrd ?? "", row.bidClsfcNo ?? "", row.rbidNo ?? ""].join("-"),
    bidNoticeNo: notice,
    category,
    title: row.bidNtceNm ?? "",
    winnerName: row.bidwinnrNm ?? "",
    winnerBusinessNo: normaliseBusinessNo(row.bidwinnrBizno ?? ""),
    amount: toAmount(row.sucsfbidAmt),
    awardedAt: toDate(row.fnlSucsfDate) ?? toDate(row.rlOpengDt),
    agency: row.dminsttNm || null,
  };
}

/**
 * 한 기간·한 분류의 낙찰 목록을 페이지 끝까지 훑는다.
 * 이 API 에는 업체 단위 조회 파라미터가 없어 전수 스캔이 유일한 경로다 — 거르는 일은 matchAwards 가 한다.
 */
export async function scanAwards(
  input: { from: string; to: string; category: AwardCategory },
  deps: { fetchImpl?: typeof fetch; pauseMs?: number; retries?: number } = {},
): Promise<ScanResult> {
  const serviceKey = process.env.NTS_SERVICE_KEY;
  if (!serviceKey) return { awards: [], scanned: 0, failed: true, reason: "NTS_SERVICE_KEY 가 설정되지 않았습니다." };

  const fetchImpl = deps.fetchImpl ?? fetch;
  const pauseMs = deps.pauseMs ?? DEFAULT_PAUSE_MS;
  const retries = deps.retries ?? DEFAULT_RETRIES;
  const awards: ProcurementAward[] = [];
  let total = Number.POSITIVE_INFINITY;
  let emptyAttempts = 0;

  for (let page = 1, request = 0; request <= MAX_PAGES; request += 1) {
    const url = new URL(`${SCAN_URL}/${OPERATION[input.category]}`);
    url.searchParams.set("serviceKey", serviceKey);
    url.searchParams.set("inqryDiv", "1");
    url.searchParams.set("inqryBgnDt", `${input.from.replace(/\D/g, "")}0000`);
    url.searchParams.set("inqryEndDt", `${input.to.replace(/\D/g, "")}2359`);
    url.searchParams.set("numOfRows", String(PAGE_SIZE));
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("type", "json");

    let body: ApiBody;
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) return { awards, scanned: awards.length, failed: true, reason: `조달청 응답 ${response.status}` };
      body = (await response.json()) as ApiBody;
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "알 수 없는 오류";
      return { awards, scanned: awards.length, failed: true, reason: `조달청 조회 실패: ${reason}` };
    }

    const header = body.response?.header;
    if (header?.resultCode && header.resultCode !== "00") {
      return { awards, scanned: awards.length, failed: true, reason: explainResultCode(header.resultCode, header.resultMsg ?? "") };
    }

    const rows = itemsOf(body);
    total = body.response?.body?.totalCount ?? total;

    if (rows.length === 0) {
      if (awards.length >= total) break;
      emptyAttempts += 1;
      if (emptyAttempts >= retries) {
        return {
          awards,
          scanned: awards.length,
          failed: true,
          reason: `조달청이 ${total}건 중 ${awards.length}건까지만 주고 빈 응답을 반복했습니다 — 스캔 미완료`,
        };
      }
      await pause(pauseMs * emptyAttempts);
      continue;
    }

    emptyAttempts = 0;
    for (const row of rows) awards.push(toAward(row, input.category));
    if (rows.length < PAGE_SIZE || awards.length >= total) break;
    page += 1;
    await pause(pauseMs);
  }

  return { awards, scanned: awards.length };
}

/**
 * 전수 스캔한 낙찰에서 대상 기업의 것만 골라낸다.
 * 사업자번호 일치만 확정이다 — 상호는 후보로 남긴다. 옥타코/옥타코리아처럼 부분 일치로 잡으면 동명 타사를 집는다.
 */
export function matchAwards(awards: ProcurementAward[], companies: MatchTarget[]): AwardMatch[] {
  const byNumber = new Map<string, MatchTarget>();
  const byName = new Map<string, MatchTarget>();
  for (const company of companies) {
    const number = company.businessNo ? normaliseBusinessNo(company.businessNo) : null;
    if (number) byNumber.set(number, company);
    byName.set(normaliseCompanyName(company.name), company);
  }

  const matches: AwardMatch[] = [];
  for (const award of awards) {
    if (award.winnerBusinessNo) {
      const confirmed = byNumber.get(award.winnerBusinessNo);
      if (confirmed) matches.push({ companyId: confirmed.id, matchedBy: "bizno", award });
      continue;
    }
    const candidate = byName.get(normaliseCompanyName(award.winnerName));
    if (candidate) matches.push({ companyId: candidate.id, matchedBy: "name", award });
  }
  return matches;
}

export type AwardRow = { matchedBy: "bizno" | "name"; amount: number | null; awardedAt: string | null };
export type ProcurementSummary = {
  count: number;
  total: number;
  candidates: number;
  years: Array<{ year: number; count: number; total: number }>;
};

/**
 * 저장된 낙찰 행을 확정 건수·금액과 연도 추이로 접는다.
 * 상호 매칭 후보는 금액에 넣지 않고 건수만 센다 — 근거의 급이 다르다.
 */
export function summariseAwards(rows: AwardRow[]): ProcurementSummary {
  const confirmed = rows.filter((row) => row.matchedBy === "bizno");
  const byYear = new Map<number, { count: number; total: number }>();
  for (const row of confirmed) {
    const year = row.awardedAt ? Number(row.awardedAt.slice(0, 4)) : null;
    if (year === null || Number.isNaN(year)) continue;
    const bucket = byYear.get(year) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += row.amount ?? 0;
    byYear.set(year, bucket);
  }

  return {
    count: confirmed.length,
    total: confirmed.reduce((sum, row) => sum + (row.amount ?? 0), 0),
    candidates: rows.length - confirmed.length,
    years: [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, bucket]) => ({ year, ...bucket })),
  };
}

function stamp(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function monthsBack(year: number, month: number, day: number, back: number) {
  const lastDay = new Date(Date.UTC(year, month - back + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - back, Math.min(day, lastDay)));
}

/**
 * 조회 기간을 월 단위 창으로 쪼갠다 — 낙찰 API 는 한 번에 넓은 기간을 주지 않는다.
 * 창은 KST 달력 기준으로 하루도 겹치거나 비지 않게 이어 붙인다.
 */
export function monthlyWindows(end: Date, months: number) {
  const kst = new Date(end.getTime() + KST_OFFSET_MS);
  const [year, month, day] = [kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()];

  return Array.from({ length: months }, (_, i) => {
    const from = monthsBack(year, month, day, i + 1);
    from.setUTCDate(from.getUTCDate() + 1);
    return { from: stamp(from), to: stamp(monthsBack(year, month, day, i)) };
  });
}
