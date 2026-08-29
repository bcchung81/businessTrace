import type { CompanyPipelineRow } from "@/lib/repositories/companyPipeline";
import type { CompanyNews } from "@/lib/services/newsCoverage";
import { sortForTriage, type CompanyVerdict, type Verdict } from "@/lib/services/verdictRollup";

export type MatrixRow = CompanyPipelineRow & {
  verdict: Verdict;
  faithfulness: number | null;
  citations: number;
  latestArticle: string | null;
};

export type MatrixSort = "triage" | "name" | "score" | "news";

/** 매트릭스에 남기는 원천 열. 뉴스·금융위·분석·검증은 다른 열이 대신한다. */
export const MATRIX_COLUMNS = ["nts", "nps", "narajangteo", "venture", "dart", "dartFinance"] as const;

function stamp(published: string | null) {
  if (!published) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(published);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * 파이프라인 행에 판정·점수·인용·최신 보도일을 붙인다.
 */
export function buildMatrixRows(
  pipeline: CompanyPipelineRow[],
  verdicts: CompanyVerdict[],
  news: CompanyNews[],
): MatrixRow[] {
  const verdictById = new Map(verdicts.map((entry) => [entry.companyId, entry]));
  const newsById = new Map(news.map((entry) => [entry.companyId, entry]));

  return pipeline.map((row) => {
    const verdict = verdictById.get(row.id);
    return {
      ...row,
      verdict: verdict?.verdict ?? "pending",
      faithfulness: verdict?.faithfulness ?? null,
      citations: verdict?.citations ?? 0,
      latestArticle: newsById.get(row.id)?.latest ?? null,
    };
  });
}

/**
 * 봐야 할 순서·기업명·검증 점수·최근 보도 네 기준 중 하나로 세운다.
 */
export function sortMatrixRows(rows: MatrixRow[], sort: MatrixSort): MatrixRow[] {
  switch (sort) {
    case "name":
      return [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    case "score":
      return [...rows].sort(
        (a, b) => (a.faithfulness ?? Number.POSITIVE_INFINITY) - (b.faithfulness ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name, "ko"),
      );
    case "news":
      return [...rows].sort((a, b) => stamp(a.latestArticle) - stamp(b.latestArticle) || a.name.localeCompare(b.name, "ko"));
    default:
      return sortForTriage(rows);
  }
}
