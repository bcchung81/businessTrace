import { getCompanyProfile, getFinancialSummary } from "@/lib/services/dart";
import { lookupCorpOutline } from "@/lib/services/fscCorpOutline";
import { checkBusinessStatus } from "@/lib/services/nts";
import { getProcurementProfile } from "@/lib/services/narajangteo";
import { findCertification } from "@/lib/services/ventureCertification";
import { lookupWorkplace } from "@/lib/services/nps";
import type { Evidence } from "@/lib/services/sourceEvidence";

export type Collectors = {
  getCompanyProfile: typeof getCompanyProfile;
  getFinancialSummary: typeof getFinancialSummary;
  lookupCorpOutline: typeof lookupCorpOutline;
  checkBusinessStatus: typeof checkBusinessStatus;
  getProcurementProfile: typeof getProcurementProfile;
  findCertification: typeof findCertification;
  lookupWorkplace: typeof lookupWorkplace;
};

export type BusinessNoSource = "registry" | "dart" | "fsc" | null;

export type CollectedEvidence = {
  evidence: Evidence;
  businessNo: string | null;
  businessNoSource: BusinessNoSource;
};

const DEFAULT_COLLECTORS: Collectors = {
  getCompanyProfile,
  getFinancialSummary,
  lookupCorpOutline,
  checkBusinessStatus,
  getProcurementProfile,
  findCertification,
  lookupWorkplace,
};

/**
 * 한 기업의 모든 공식 원천을 모은다.
 * 사업자번호가 연쇄의 시작점이라 DART → 금융위 순으로 먼저 확보하고, 실패하면 번호가 필요한 원천은 건너뛴다.
 */
export async function collectEvidence(
  company: { name: string; year: number; businessNo?: string | null },
  deps: Collectors = DEFAULT_COLLECTORS,
): Promise<CollectedEvidence> {
  const known = company.businessNo ?? null;
  const profile = await deps.getCompanyProfile(company.name);
  const outline = known || profile.businessNo ? null : await deps.lookupCorpOutline(company.name);
  const businessNo = known ?? profile.businessNo ?? outline?.businessNo ?? null;
  const businessNoSource: BusinessNoSource = known
    ? "registry"
    : profile.businessNo
      ? "dart"
      : outline?.businessNo
        ? "fsc"
        : null;

  const [financial, businessStatus, procurement, certification, pension] = await Promise.all([
    deps.getFinancialSummary(company.name, company.year),
    businessNo ? deps.checkBusinessStatus(businessNo) : Promise.resolve(null),
    businessNo ? deps.getProcurementProfile(businessNo) : Promise.resolve(null),
    deps.findCertification(company.name, new Date()),
    deps.lookupWorkplace(company.name, { businessNo: businessNo ?? undefined }),
  ]);

  return {
    evidence: { profile, financial, outline, businessStatus, procurement, certification, pension },
    businessNo,
    businessNoSource,
  };
}
