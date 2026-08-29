import { prisma } from "@/lib/db";
import { MATRIX_STAGES } from "@/lib/services/pipelineMatrix";

/** 확인·결측·측정 불가·충돌·미조회 — 빈칸을 한 종류로 뭉개지 않는다. */
export type CellState = "ok" | "absent" | "unmeasurable" | "conflict" | "pending";

export type PipelineCell = { state: CellState; value: string; note: string };

export type CompanyPipelineRow = {
  id: number;
  name: string;
  businessNo: string | null;
  cells: Record<string, PipelineCell>;
};

const SNAPSHOT_STATE: Record<string, CellState> = {
  found: "ok",
  absent: "absent",
  unmeasurable: "unmeasurable",
  conflict: "conflict",
  pending: "pending",
};

const EMPTY: PipelineCell = { state: "pending", value: "", note: "" };

/**
 * 스냅샷 요약을 값과 부연으로 가른다.
 * 요약은 "계속사업자 · 부가가치세 일반과세자" 처럼 값이 앞, 근거가 뒤에 오도록 만들어 둔다.
 */
export function splitSummary(summary: string): { value: string; note: string } {
  const [value, ...rest] = (summary ?? "").split(" · ");
  return { value: value ?? "", note: rest.join(" · ") };
}

function articleCount(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 기업마다 파이프라인 각 단계가 무엇을 돌려줬는지 값과 함께 낸다.
 * 상태만 두면 "돌았다"까지만 알 수 있다. 심사는 그 단계가 무엇을 가져왔는지를 본다.
 */
export async function listCompanyPipeline(year: number): Promise<CompanyPipelineRow[]> {
  const companies = await prisma.company.findMany({
    where: { year, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    include: {
      sourceSnapshots: { select: { source: true, status: true, summary: true } },
      analysisRuns: {
        orderBy: { createdAt: "desc" },
        select: { status: true, newsJson: true, verification: { select: { status: true } } },
      },
    },
  });

  return companies.map((company) => {
    const cells: Record<string, PipelineCell> = Object.fromEntries(
      MATRIX_STAGES.map((stage) => [stage.key, { ...EMPTY }]),
    );

    for (const snapshot of company.sourceSnapshots) {
      if (!(snapshot.source in cells)) continue;
      cells[snapshot.source] = {
        state: SNAPSHOT_STATE[snapshot.status] ?? "pending",
        ...splitSummary(snapshot.summary ?? ""),
      };
    }

    const latest = company.analysisRuns[0];
    if (latest) {
      cells.news = { state: "ok", value: `${articleCount(latest.newsJson)}건`, note: "" };
    }

    if (company.analysisRuns.some((run) => run.status === "completed")) {
      cells.llm = { state: "ok", value: "완료", note: "" };
    }

    const verdict = company.analysisRuns.find((run) => run.verification !== null)?.verification;
    if (verdict) {
      cells.verify =
        verdict.status === "verified"
          ? { state: "ok", value: "검증 완료", note: "" }
          : { state: "conflict", value: "검토 필요", note: "" };
    }

    return { id: company.id, name: company.name, businessNo: company.businessNo ?? null, cells };
  });
}
