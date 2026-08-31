import { findCorpCandidates, type CorpCandidate } from "@/lib/services/dartCorpCode";
import { getAuditReportFinancials } from "@/lib/services/dartAuditReport";

const COMPANY_URL = "https://opendart.fss.or.kr/api/company.json";
const FINANCE_URL = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json";
const ANNUAL_REPORT_CODE = "11011";
const REQUEST_TIMEOUT_MS = 10000;

export type DartDeps = { fetchImpl?: typeof fetch };

export type CompanyProfile = {
  found: boolean;
  corpCode?: string;
  stockCode?: string | null;
  corpName?: string;
  businessNo?: string;
  corporateNo?: string;
  ceoName?: string;
  industryCode?: string;
  candidates?: CorpCandidate[];
  decidedAbsent?: boolean;
  failed?: boolean;
  reason?: string;
};

export type FinancialFigures = {
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalAssets: number | null;
};

export type FinancialSummary = {
  found: boolean;
  fiscalYear: number;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  previous?: FinancialFigures;
  source?: "annualReport" | "auditReport";
  failed?: boolean;
  reason?: string;
};

type DartResponse = { status?: string; message?: string } & Record<string, unknown>;

function requireApiKey() {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 가 설정되지 않았습니다.");
  return key;
}

function buildUrl(base: string, params: Record<string, string>) {
  const url = new URL(base);
  url.searchParams.set("crtfc_key", requireApiKey());
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url;
}

async function callDart(url: URL, fetchImpl: typeof fetch): Promise<DartResponse> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`DART ${response.status}`);
  return (await response.json()) as DartResponse;
}

async function resolveCorp(companyName: string) {
  const candidates = await findCorpCandidates(companyName);
  const exact = candidates.find((entry) => entry.corpName === companyName.trim());
  return { candidates, exact };
}

function parseAmount(raw: unknown) {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/,/g, "").trim();
  if (!/^-?\d+$/.test(digits)) return null;
  return Number(digits);
}

/**
 * 기업명으로 DART 기업개황을 조회해 사업자번호까지 가져온다.
 * 사업자번호가 있어야 국세청 휴폐업·나라장터 대조가 열린다.
 */
export async function getCompanyProfile(
  companyName: string,
  deps: DartDeps = {},
  hints: { corpCode?: string } = {},
): Promise<CompanyProfile> {
  const { candidates, exact } = hints.corpCode
    ? { candidates: [], exact: { corpCode: hints.corpCode, corpName: companyName.trim(), stockCode: null } }
    : await resolveCorp(companyName);

  if (!exact) {
    if (candidates.length === 0) {
      return { found: false, reason: "DART 에 등록되지 않은 기업입니다." };
    }
    return { found: false, candidates, reason: "기업명이 정확히 일치하지 않습니다. 후보에서 선택하세요." };
  }

  let body: DartResponse;
  try {
    body = await callDart(buildUrl(COMPANY_URL, { corp_code: exact.corpCode }), deps.fetchImpl ?? fetch);
  } catch (caught) {
    return {
      found: false,
      failed: true,
      corpCode: exact.corpCode,
      reason: `DART 조회 실패: ${caught instanceof Error ? caught.message : "알 수 없는 오류"}`,
    };
  }

  if (body.status !== "000") {
    return {
      found: false,
      corpCode: exact.corpCode,
      reason: `DART 응답 ${body.status}: ${body.message ?? "사유 없음"}`,
    };
  }

  return {
    found: true,
    corpCode: exact.corpCode,
    stockCode: exact.stockCode,
    corpName: String(body.corp_name ?? exact.corpName),
    businessNo: typeof body.bizr_no === "string" ? body.bizr_no : undefined,
    corporateNo: typeof body.jurir_no === "string" ? body.jurir_no : undefined,
    ceoName: typeof body.ceo_nm === "string" ? body.ceo_nm : undefined,
    industryCode: typeof body.induty_code === "string" ? body.induty_code : undefined,
  };
}

/**
 * 사업보고서 기준 매출·영업이익·순이익·자산총계를 가져온다. 구조화 API 에 없으면(013) 감사보고서 원문에서 추출을 시도한다.
 * 그래도 없으면 오류가 아니라 found=false 다 — 비상장·무공시 기업은 재무가 없는 것이 정상이다.
 */
export async function getFinancialSummary(
  companyName: string,
  fiscalYear: number,
  deps: DartDeps = {},
  hints: { corpCode?: string } = {},
): Promise<FinancialSummary> {
  const empty = {
    fiscalYear,
    revenue: null,
    operatingIncome: null,
    netIncome: null,
    totalAssets: null,
  };

  const exact = hints.corpCode ? { corpCode: hints.corpCode } : (await resolveCorp(companyName)).exact;
  if (!exact) return { found: false, ...empty, reason: "DART 에 등록되지 않은 기업입니다." };

  let body: DartResponse;
  try {
    body = await callDart(
      buildUrl(FINANCE_URL, {
        corp_code: exact.corpCode,
        bsns_year: String(fiscalYear),
        reprt_code: ANNUAL_REPORT_CODE,
      }),
      deps.fetchImpl ?? fetch,
    );
  } catch (caught) {
    return {
      found: false,
      ...empty,
      failed: true,
      reason: `DART 조회 실패: ${caught instanceof Error ? caught.message : "알 수 없는 오류"}`,
    };
  }

  if (body.status !== "000") {
    if (body.status === "013") {
      const audit = await getAuditReportFinancials(exact.corpCode, fiscalYear, deps).catch(() => null);
      if (audit) {
        return {
          found: true,
          source: "auditReport",
          fiscalYear,
          revenue: audit.revenue,
          operatingIncome: audit.operatingIncome,
          netIncome: audit.netIncome,
          totalAssets: audit.totalAssets,
          previous: audit.previous,
        };
      }
    }
    return {
      found: false,
      ...empty,
      reason: `DART 응답 ${body.status}: ${body.message ?? "사유 없음"}`,
    };
  }

  const rows = Array.isArray(body.list) ? (body.list as Array<Record<string, unknown>>) : [];
  const pick = (accountName: string, field: "thstrm_amount" | "frmtrm_amount" = "thstrm_amount") =>
    parseAmount(rows.find((row) => row.account_nm === accountName)?.[field]);

  return {
    found: true,
    source: "annualReport",
    fiscalYear,
    revenue: pick("매출액"),
    operatingIncome: pick("영업이익"),
    netIncome: pick("당기순이익"),
    totalAssets: pick("자산총계"),
    previous: {
      revenue: pick("매출액", "frmtrm_amount"),
      operatingIncome: pick("영업이익", "frmtrm_amount"),
      netIncome: pick("당기순이익", "frmtrm_amount"),
      totalAssets: pick("자산총계", "frmtrm_amount"),
    },
  };
}
