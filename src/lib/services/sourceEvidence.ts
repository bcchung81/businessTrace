import type { CompanyProfile, FinancialSummary } from "@/lib/services/dart";
import type { CorpOutline } from "@/lib/services/fscCorpOutline";
import type { BusinessStatus } from "@/lib/services/nts";
import type { ProcurementProfile } from "@/lib/services/narajangteo";
import type { ProcurementSummary } from "@/lib/services/procurementWins";
import type { Certification } from "@/lib/services/ventureCertification";
import type { NpsWorkplace } from "@/lib/services/nps";

export const SOURCE_KEYS = [
  "dart",
  "dartFinance",
  "fsc",
  "nts",
  "narajangteo",
  "procurement",
  "venture",
  "nps",
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

/** 확인 · 결측 · 측정 불가 · 충돌 · 미조회 — 빈칸을 한 종류로 뭉개지 않는다. */
export type SourceStatus = "found" | "absent" | "unmeasurable" | "conflict" | "pending";

export type SnapshotRow = {
  source: SourceKey;
  status: SourceStatus;
  summary: string;
  payload: unknown;
};

export type Evidence = {
  profile: CompanyProfile;
  financial: FinancialSummary | null;
  outline: CorpOutline | null;
  businessStatus: BusinessStatus | null;
  procurement: ProcurementProfile | null;
  certification: Certification;
  pension: NpsWorkplace;
};

function failure(source: SourceKey, reason: string | undefined, payload: unknown): SnapshotRow {
  return { source, status: "pending", summary: reason ?? "조회 실패", payload };
}

function dart(profile: CompanyProfile): SnapshotRow {
  if (profile.failed) return failure("dart", profile.reason, profile);
  if (profile.found) {
    return { source: "dart", status: "found", summary: profile.corpName ?? "기업개황 조회됨", payload: profile };
  }
  if (profile.candidates?.length) {
    return {
      source: "dart",
      status: "conflict",
      summary: `이름이 정확히 맞는 기업이 없다 · 후보 ${profile.candidates.length}건`,
      payload: profile,
    };
  }
  if (profile.decidedAbsent) return { source: "dart", status: "absent", summary: profile.reason ?? "운영자가 DART 미등록으로 확정", payload: profile };
  return { source: "dart", status: "absent", summary: "DART 에 등록되지 않은 기업", payload: profile };
}

function dartFinance(financial: FinancialSummary | null): SnapshotRow {
  if (!financial) {
    return { source: "dartFinance", status: "pending", summary: "재무 조회를 실행하지 않았다", payload: null };
  }
  if (financial.failed) return failure("dartFinance", financial.reason, financial);
  return financial.found
    ? {
        source: "dartFinance",
        status: "found",
        summary: `${financial.fiscalYear}년 매출 ${financial.revenue ?? "미상"}${financial.source === "auditReport" ? " · 감사보고서" : ""}`,
        payload: financial,
      }
    : { source: "dartFinance", status: "absent", summary: "재무제표 미공시 — 정기·감사보고서 없음", payload: financial };
}

function fsc(outline: CorpOutline | null, businessNo: string | null, decision?: string): SnapshotRow {
  if (decision === "none") {
    return { source: "fsc", status: "absent", summary: "운영자가 동명 타사로 확정 — 금융위 미등재", payload: outline };
  }
  if (!outline) {
    return { source: "fsc", status: "pending", summary: "조회하지 않았다", payload: null };
  }
  if (outline.failed) return failure("fsc", outline.reason, outline);
  if (!outline.found) return { source: "fsc", status: "absent", summary: "금융위 명단에 없음", payload: outline };
  if (decision && outline.businessNo === decision) {
    return { source: "fsc", status: "found", summary: `${outline.corpName ?? "기업"} · ${decision} 운영자 확정`, payload: outline };
  }
  if (businessNo && outline.businessNo && outline.businessNo !== businessNo) {
    return {
      source: "fsc",
      status: "conflict",
      summary: `사업자번호 불일치 · 확보 ${businessNo} ↔ 금융위 ${outline.businessNo}`,
      payload: outline,
    };
  }
  return {
    source: "fsc",
    status: "found",
    summary:
      businessNo && outline.businessNo === businessNo
        ? `${outline.corpName ?? "기업"} · ${businessNo} 번호 일치`
        : `${outline.corpName ?? "기업"} · ${outline.businessNo ?? "번호 없음"}`,
    payload: outline,
  };
}

function nts(status: BusinessStatus | null): SnapshotRow {
  if (!status) {
    return { source: "nts", status: "pending", summary: "사업자번호 미확보로 조회하지 못했다", payload: null };
  }
  if (!status.checked) {
    return { source: "nts", status: "pending", summary: status.reason ?? "조회하지 못했다", payload: status };
  }
  const inactiveState = status.statusCode === "02" || status.status?.startsWith("휴업") ? "휴업" : "폐업";
  return {
    source: "nts",
    status: "found",
    summary: status.isActive
      ? `계속사업자 · ${status.taxType ?? "과세유형 미상"}`
      : `${inactiveState} · ${status.closedAt ?? "일자 미상"}`,
    payload: status,
  };
}

function narajangteo(procurement: ProcurementProfile | null): SnapshotRow {
  if (!procurement) {
    return { source: "narajangteo", status: "pending", summary: "사업자번호 미확보로 조회하지 못했다", payload: null };
  }
  if (procurement.failed) return failure("narajangteo", procurement.reason, procurement);
  return procurement.found
    ? {
        source: "narajangteo",
        status: "found",
        summary: `조달업체 등록 · 종업원 ${procurement.employeeCount ?? "미상"}`,
        payload: procurement,
      }
    : {
        source: "narajangteo",
        status: "unmeasurable",
        summary: "조달업체 미등록 — 공공조달 미참여",
        payload: procurement,
      };
}

function venture(certification: Certification): SnapshotRow {
  if (!certification.certified) {
    return { source: "venture", status: "absent", summary: "벤처확인 명단에 없음", payload: certification };
  }
  return {
    source: "venture",
    status: "found",
    summary: `${certification.type ?? "벤처확인"} · ${certification.validUntil ?? "기간 미상"} 까지`,
    payload: certification,
  };
}

function nps(workplace: NpsWorkplace): SnapshotRow {
  if (workplace.failed) {
    return {
      source: "nps",
      status: "pending",
      summary: workplace.reason ?? "조회 실패",
      payload: workplace,
    };
  }
  if (workplace.found) {
    return {
      source: "nps",
      status: "found",
      summary: `가입자 ${workplace.subscribers ?? "미상"}명 · ${workplace.businessNoPrefix ?? "번호 없음"}`,
      payload: workplace,
    };
  }
  if (workplace.numberMismatch) {
    return {
      source: "nps",
      status: "absent",
      summary: "확보 번호와 일치하는 가입 사업장 없음 — 미가입 가능성",
      payload: workplace,
    };
  }
  if (workplace.candidates?.length) {
    return {
      source: "nps",
      status: "conflict",
      summary: `상호가 겹치는 사업장이 여럿이다 · 후보 ${workplace.candidates.length}건`,
      payload: workplace,
    };
  }
  return { source: "nps", status: "absent", summary: "가입 사업장 없음", payload: workplace };
}

/**
 * 원천별 조회 결과를 저장 가능한 스냅샷 행으로 접는다. 확보한 사업자번호를 주면 금융위 번호와 대조한다.
 * 조회하지 못한 원천도 pending 으로 남긴다 — 행이 빠지면 화면에서 없는 줄도 모른다.
 */
export function toSnapshots(evidence: Evidence, businessNo: string | null = null, decisions: { fsc?: string } = {}): SnapshotRow[] {
  return [
    dart(evidence.profile),
    dartFinance(evidence.financial),
    fsc(evidence.outline, businessNo, decisions.fsc),
    nts(evidence.businessStatus),
    narajangteo(evidence.procurement),
    venture(evidence.certification),
    nps(evidence.pension),
  ];
}

/**
 * 배치가 모은 낙찰 집계를 스냅샷 한 행으로 접는다 — 전수 스캔이라 단건 새로고침 경로(toSnapshots)에 들어가지 않는다.
 * 스캔했는데 없는 것은 결측이 아니라 측정 불가다. 조달 미참여를 실적 0으로 읽으면 조달과 무관한 기업이 부당하게 깎인다.
 */
export function procurementSnapshot(summary: ProcurementSummary, scan: { complete: boolean } = { complete: true }): SnapshotRow {
  const candidates = summary.candidates > 0 ? ` · 상호 일치 후보 ${summary.candidates}건(미확정)` : "";
  const incomplete = scan.complete ? "" : " · 스캔 미완료";
  if (summary.count > 0) {
    return {
      source: "procurement",
      status: "found",
      summary: `낙찰 ${summary.count}건 · ${summary.total.toLocaleString("en-US")}원${candidates}${incomplete}`,
      payload: summary,
    };
  }
  if (!scan.complete) {
    return {
      source: "procurement",
      status: "pending",
      summary: `스캔 미완료 — 조달청이 기간을 다 주지 않았다${candidates}`,
      payload: summary,
    };
  }
  return {
    source: "procurement",
    status: "unmeasurable",
    summary: `공공조달 낙찰 없음 — 조달 미참여(매출 미측정)${candidates}`,
    payload: summary,
  };
}
