import { listCompanies, listYears } from "@/lib/repositories/companyRepository";
import { listCompanyPipeline } from "@/lib/repositories/companyPipeline";
import { listLatestVerifications } from "@/lib/repositories/verificationResult";
import { KST_OFFSET_MS } from "@/lib/services/kst";
import { pendingCompanyIds, rollupVerdicts } from "@/lib/services/verdictRollup";

export type MonthRef = { year: number; month: number };
export type HeaderToolsData = { year: number; thisMonth: MonthRef; lastMonth: MonthRef; pendingIds: number[] };

/**
 * 월간 문서의 이번 달·지난 달 — KST 벽시계 기준. UTC 로 세면 1일 새벽에 달이 하루 어긋난다.
 */
export function monthWindow(now: Date): { thisMonth: MonthRef; lastMonth: MonthRef } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const last = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  return {
    thisMonth: { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 },
    lastMonth: { year: last.getUTCFullYear(), month: last.getUTCMonth() + 1 },
  };
}

/**
 * 헤더 공통 도구(월간 문서·미분석 실행)가 필요한 값 — 최신 평가연도 기준.
 * 헤더는 모든 화면에 공통이라 화면의 `?year=` 를 따르지 않는다.
 */
export async function loadHeaderTools(now: Date = new Date()): Promise<HeaderToolsData> {
  const year = (await listYears())[0] ?? now.getFullYear();
  const companies = await listCompanies({ year });
  const verdicts = rollupVerdicts({
    companies: companies.map((company) => ({ id: company.id, name: company.name })),
    verifications: await listLatestVerifications(year),
    pipeline: await listCompanyPipeline(year),
  });
  return { year, ...monthWindow(now), pendingIds: pendingCompanyIds(verdicts.companies) };
}
