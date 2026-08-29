import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { RankEntry } from "@/lib/services/dashboardSummary";
import { isStale, type NewsCoverage } from "@/lib/services/newsCoverage";
import { conflictStages, MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

export type ActionKey = "businessNo" | "conflict" | "stale" | "decline";

export type ActionItem = {
  key: ActionKey;
  title: string;
  tone: "review" | "risk" | "plain";
  count: number;
  companies: Array<{ id: number; name: string; detail?: string }>;
  remedy: string;
};

/** 12개월 인원이 이 비율 이하로 줄면 조치 대상이다. */
export const DECLINE_RATIO = -0.2;

const STAGE_SHORT = new Map(MATRIX_STAGES.map((stage) => [stage.key, stage.short]));

/**
 * 운영자가 오늘 손대야 할 네 가지를 건수·기업·처방으로 낸다.
 * 0건이어도 항목을 남긴다 — 항목이 사라지면 점검했는지 알 수 없다.
 */
export function buildActionItems(input: {
  companies: Array<{ id: number; name: string; businessNo: string | null }>;
  pipeline: CompanyPipelineRow[];
  news: NewsCoverage;
  declining: RankEntry[];
  now?: Date;
}): ActionItem[] {
  const now = input.now ?? new Date();
  const nameById = new Map(input.companies.map((company) => [company.id, company.name]));

  const missingBusinessNo = input.companies
    .filter((company) => !company.businessNo)
    .map((company) => ({ id: company.id, name: company.name }));

  const conflictRows = input.pipeline
    .map((row) => ({ id: row.id, name: row.name, stages: conflictStages(row.cells) }))
    .filter((row) => row.stages.length > 0);
  const conflicts = conflictRows.map((row) => ({
    id: row.id,
    name: row.name,
    detail: row.stages.map((stage) => STAGE_SHORT.get(stage) ?? stage).join("·"),
  }));
  const conflictSources = [...new Set(conflictRows.flatMap((row) => row.stages).map((stage) => STAGE_SHORT.get(stage) ?? stage))];

  const stale = input.news.byCompany
    .filter((row) => isStale(row.latest, now))
    .map((row) => ({ id: row.companyId, name: row.name }));

  const declines = input.declining
    .filter((entry) => entry.ratio <= DECLINE_RATIO)
    .map((entry) => ({
      id: entry.companyId,
      name: nameById.get(entry.companyId) ?? entry.name,
      detail: `▼${Math.round(Math.abs(entry.ratio) * 100)}%`,
    }));

  return [
    {
      key: "businessNo",
      title: "사업자번호 미확보",
      tone: "review",
      count: missingBusinessNo.length,
      companies: missingBusinessNo,
      remedy: "금융위 폴백도 실패 — 수기 입력 필요",
    },
    {
      key: "conflict",
      title: "동명 타사 충돌",
      tone: "risk",
      count: conflicts.length,
      companies: conflicts,
      remedy: `${conflictSources.length > 0 ? conflictSources.join("·") : "원천"} 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정`,
    },
    {
      key: "stale",
      title: "30일 이상 보도 없음",
      tone: "plain",
      count: stale.length,
      companies: stale,
      remedy: "뉴스 근거가 낡았다 — 재수집 후 재분석",
    },
    {
      key: "decline",
      title: "12개월 인원 20% 이상 감소",
      tone: "plain",
      count: declines.length,
      companies: declines,
      remedy: "국민연금 실측 — 본사 이전 여부를 상세에서 확인",
    },
  ];
}
