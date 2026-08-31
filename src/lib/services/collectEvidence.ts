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

export type Decisions = { dart?: string; nps?: string; fsc?: string };

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
 * 사업자번호가 연쇄의 시작점이라 등록부 → DART → 금융위 순으로 확보하고, 실패하면 번호가 필요한 원천은 건너뛴다.
 * 금융위는 번호가 있어도 항상 조회한다 — 확보한 번호와 대조해 등록 명단 오타·동명 타사를 잡는다.
 * 운영자 결정이 있으면 DART 는 그 코드로(또는 미등록으로), 국민연금은 그 앞 6자리로 고정한다.
 */
export async function collectEvidence(
  company: { name: string; year: number; businessNo?: string | null },
  deps: Collectors = DEFAULT_COLLECTORS,
  decisions: Decisions = {},
): Promise<CollectedEvidence> {
  const known = company.businessNo ?? null;
  const profile =
    decisions.dart === "none"
      ? { found: false, decidedAbsent: true, reason: "운영자가 DART 미등록으로 확정" }
      : decisions.dart
        ? await deps.getCompanyProfile(company.name, undefined, { corpCode: decisions.dart })
        : await deps.getCompanyProfile(company.name);
  const outline = await deps.lookupCorpOutline(company.name);
  const businessNo = known ?? profile.businessNo ?? outline?.businessNo ?? null;
  const businessNoSource: BusinessNoSource = known
    ? "registry"
    : profile.businessNo
      ? "dart"
      : outline?.businessNo
        ? "fsc"
        : null;

  const [financial, businessStatus, procurement, certification, pension] = await Promise.all([
    decisions.dart === "none"
      ? Promise.resolve(null)
      : decisions.dart
        ? deps.getFinancialSummary(company.name, company.year, undefined, { corpCode: decisions.dart })
        : deps.getFinancialSummary(company.name, company.year),
    businessNo ? deps.checkBusinessStatus(businessNo) : Promise.resolve(null),
    businessNo ? deps.getProcurementProfile(businessNo) : Promise.resolve(null),
    deps.findCertification(company.name, new Date()),
    deps.lookupWorkplace(company.name, { businessNo: decisions.nps ?? businessNo ?? undefined }),
  ]);

  return {
    evidence: { profile, financial, outline, businessStatus, procurement, certification, pension },
    businessNo,
    businessNoSource,
  };
}
