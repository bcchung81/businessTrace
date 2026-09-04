import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";
import { financeRatios, type FinanceRatios } from "@/lib/services/financeRatios";
import type { CompanyProfile, FinancialSummary } from "@/lib/services/dart";
import type { CorpOutline } from "@/lib/services/fscCorpOutline";
import type { ProcurementProfile } from "@/lib/services/narajangteo";
import type { NpsWorkplace } from "@/lib/services/nps";
import type { ProcurementSummary } from "@/lib/services/procurementWins";
import type { BusinessStatus } from "@/lib/services/nts";
import type { SourceKey } from "@/lib/services/sourceEvidence";
import type { Certification } from "@/lib/services/ventureCertification";

export type FactValue = { value: string; sources: string[]; agreement: "single" | "match" | "mismatch"; alternatives?: string[] };
export type EmployeeCount = { source: "nps" | "narajangteo" | "fsc"; label: string; count: number };
export type CompanyFacts = {
  /** 설립 후 만 몇 년인지 — 성장률을 읽을 때의 분모다. 설립일이 없으면 null. */
  ageYears: number | null;
  ceo: FactValue | null;
  founded: FactValue | null;
  address: FactValue | null;
  corporateNo: FactValue | null;
  employees: EmployeeCount[];
  listing: { stockCode: string | null; label: string } | null;
  finance: {
    fiscalYear: number;
    source?: "annualReport" | "auditReport";
    revenue: number | null;
    operatingIncome: number | null;
    netIncome: number | null;
    totalAssets: number | null;
    growth: { revenue: number | null; operatingIncome: number | null };
    ratios: FinanceRatios;
  } | null;
  payroll: { averageBaseIncome: number; annualPayroll: number } | null;
  procurement: ProcurementSummary | null;
  turnover: { hired: number; departed: number; rate: number | null; months: number } | null;
  sourceDetails: Record<SourceKey, string[]>;
};

const SOURCE_NAME: Record<SourceKey, string> = { dart: "DART", dartFinance: "DART 재무", fsc: "금융위", nts: "국세청", narajangteo: "나라장터", procurement: "조달 낙찰", venture: "벤처확인", nps: "국민연금" };

function payloadOf<T>(snapshots: StoredSnapshot[], source: SourceKey): T | null {
  const row = snapshots.find((s) => s.source === source && s.status === "found");
  return row && row.payload && typeof row.payload === "object" ? (row.payload as T) : null;
}

function normaliseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8 || digits.length === 14) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return raw;
}

/**
 * 원천이 흘려보낸 HTML 엔티티를 걷어낸다 — 금융위 주소 끝에 `&nbsp` 가 붙어 화면에 그대로 찍혔다.
 * 스냅샷 원문은 받은 그대로 두고 읽는 자리에서만 씻는다. 근거는 손대지 않는다.
 */
function normaliseAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:lt|gt|quot|#\d+);?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 같은 사실을 여러 원천이 말할 때 하나로 접는다 — 첫 원천 값을 대표로 쓰고, 다른 값이 있으면 불일치와 함께 남긴다.
 */
function merge(entries: Array<[string, string | null]>): FactValue | null {
  const present = entries.filter((e): e is [string, string] => e[1] !== null && e[1] !== "");
  if (present.length === 0) return null;
  const [[, value]] = present;
  const sources = present.map(([source]) => source);
  const key = (v: string) => v.replace(/[\s()]/g, "");
  const others = present.filter(([, v]) => key(v) !== key(value));
  if (present.length === 1) return { value, sources, agreement: "single" };
  return others.length === 0 ? { value, sources, agreement: "match" } : { value, sources, agreement: "mismatch", alternatives: others.map(([s, v]) => `${s} ${v}`) };
}

function amount(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

/** YYYY-MM-DD 부터 지난 만 년수. 생일이 아직 안 왔으면 한 해를 뺀다. */
function fullYearsSince(date: string | null, now: Date): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  let years = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) years -= 1;
  return years < 0 ? null : years;
}

function growthOf(current: number | null, previous: number | null | undefined) {
  if (current === null || previous === null || previous === undefined || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100) / 100;
}

function pct(growth: number | null) {
  if (growth === null) return "";
  const value = Math.round(growth * 100);
  return ` (${value >= 0 ? "▲" : "▼"}${Math.abs(value)}%)`;
}

/**
 * 저장된 원천 payload 만으로 기업 기본 정보를 조립한다 — 재조회 없이, 원천끼리의 일치 여부를 함께 낸다.
 * 인건비는 고지금액에서 나온 추정치라 화면이 "추정" 으로 표시해야 한다.
 */
export function buildCompanyFacts(input: { businessNo: string | null; snapshots: StoredSnapshot[]; now?: Date }): CompanyFacts {
  const dart = payloadOf<CompanyProfile>(input.snapshots, "dart");
  const finance = payloadOf<FinancialSummary>(input.snapshots, "dartFinance");
  const fsc = payloadOf<CorpOutline>(input.snapshots, "fsc");
  const nara = payloadOf<ProcurementProfile>(input.snapshots, "narajangteo");
  const nps = payloadOf<NpsWorkplace>(input.snapshots, "nps");
  const nts = payloadOf<BusinessStatus>(input.snapshots, "nts");
  const venture = payloadOf<Certification>(input.snapshots, "venture");
  const procurement = payloadOf<ProcurementSummary>(input.snapshots, "procurement");

  const employees: EmployeeCount[] = [];
  if (nps && typeof nps.subscribers === "number") employees.push({ source: "nps", label: "국민연금 가입자", count: nps.subscribers });
  if (nara && typeof nara.employeeCount === "number") employees.push({ source: "narajangteo", label: "조달 종업원", count: nara.employeeCount });
  if (fsc && typeof fsc.employeeCount === "number") employees.push({ source: "fsc", label: "금융위 종업원", count: fsc.employeeCount });

  const growth = finance ? { revenue: growthOf(finance.revenue, finance.previous?.revenue), operatingIncome: growthOf(finance.operatingIncome, finance.previous?.operatingIncome) } : null;
  const months = nps?.months ?? [];
  const hired = months.reduce((acc, m) => acc + (m.hired ?? 0), 0);
  const departed = months.reduce((acc, m) => acc + (m.departed ?? 0), 0);
  const subscribed = months.map((m) => m.subscribers).filter((v): v is number => typeof v === "number");
  const average = subscribed.length > 0 ? subscribed.reduce((a, b) => a + b, 0) / subscribed.length : 0;

  const sourceDetails: Record<SourceKey, string[]> = {
    dart: dart ? [dart.corpName ?? "", dart.ceoName ? `대표 ${dart.ceoName}` : "", dart.stockCode ? `상장 ${dart.stockCode}` : "비상장"].filter(Boolean) : [],
    dartFinance: finance && growth ? [`${finance.fiscalYear}년 매출 ${amount(finance.revenue)}${pct(growth.revenue)}`, `영업이익 ${amount(finance.operatingIncome)}${pct(growth.operatingIncome)}`, `자산총계 ${amount(finance.totalAssets)}`] : [],
    fsc: fsc ? [fsc.isSmallBusiness === undefined ? "" : fsc.isSmallBusiness ? "중소기업" : "중소기업 아님", fsc.mainBusiness ?? "", typeof fsc.employeeCount === "number" ? `종업원 ${fsc.employeeCount}` : ""].filter(Boolean) : [],
    nts: nts ? [nts.status ?? "", nts.taxType ?? "", nts.closedAt ? `폐업 ${normaliseDate(nts.closedAt)}` : ""].filter(Boolean) : [],
    narajangteo: nara ? [nara.businessDivision ?? "", nara.manufacturingDivision ?? "", nara.openedAt ? `개업 ${normaliseDate(nara.openedAt)}` : "", typeof nara.employeeCount === "number" ? `종업원 ${nara.employeeCount}` : ""].filter(Boolean) : [],
    procurement: procurement ? [`낙찰 ${procurement.count}건`, `${procurement.total.toLocaleString("en-US")}원`, procurement.candidates > 0 ? `상호 일치 후보 ${procurement.candidates}건(미확정)` : ""].filter(Boolean) : [],
    venture: venture ? [venture.type ?? "", venture.validFrom && venture.validUntil ? `${venture.validFrom} ~ ${venture.validUntil}` : ""].filter(Boolean) : [],
    nps: nps ? [typeof nps.subscribers === "number" ? `가입자 ${nps.subscribers}명` : "", nps.workplaceCount ? `사업장 ${nps.workplaceCount}곳` : "", nps.registeredAt ? `등록 ${normaliseDate(nps.registeredAt)}` : "", nps.withdrawnAt ? `탈퇴 ${normaliseDate(nps.withdrawnAt)}` : ""].filter(Boolean) : [],
  };

  const founded = merge([[SOURCE_NAME.narajangteo, normaliseDate(nara?.openedAt)], [SOURCE_NAME.fsc, normaliseDate(fsc?.establishedAt)]]);

  return {
    ageYears: fullYearsSince(founded?.value ?? null, input.now ?? new Date()),
    ceo: merge([[SOURCE_NAME.dart, dart?.ceoName ?? null], [SOURCE_NAME.narajangteo, nara?.ceoName ?? null]]),
    founded,
    address: merge([[SOURCE_NAME.narajangteo, normaliseAddress(nara?.address)], [SOURCE_NAME.fsc, normaliseAddress(fsc?.address)]]),
    corporateNo: merge([[SOURCE_NAME.dart, dart?.corporateNo ?? null], [SOURCE_NAME.fsc, fsc?.corporateNo ?? null]]),
    employees,
    listing: dart ? (dart.stockCode ? { stockCode: dart.stockCode, label: `상장 ${dart.stockCode}` } : { stockCode: null, label: "비상장" }) : null,
    finance: finance && growth ? { fiscalYear: finance.fiscalYear, source: finance.source, ratios: financeRatios(finance), revenue: finance.revenue, operatingIncome: finance.operatingIncome, netIncome: finance.netIncome, totalAssets: finance.totalAssets, growth } : null,
    procurement,
    payroll: nps && typeof nps.averageBaseIncome === "number" && typeof nps.annualPayroll === "number" ? { averageBaseIncome: nps.averageBaseIncome, annualPayroll: nps.annualPayroll } : null,
    turnover: months.length > 0 ? { hired, departed, rate: average > 0 ? Math.round((departed / average) * 100) / 100 : null, months: months.length } : null,
    sourceDetails,
  };
}
