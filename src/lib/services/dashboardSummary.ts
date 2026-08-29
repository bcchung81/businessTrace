import { listPensionSeries, type PensionPoint } from "@/lib/repositories/pensionSnapshot";
import { CONTRIBUTION_RATE } from "@/lib/services/nps";

export type CompanySeries = {
  companyId: number;
  name: string;
  points: PensionPoint[];
};

export type Direction = "up" | "down" | "flat" | "unknown";

export type Facet = {
  companyId: number;
  name: string;
  points: PensionPoint[];
  latest: number | null;
  from: number | null;
  delta: number | null;
  ratio: number | null;
  direction: Direction;
};

export type RankEntry = {
  companyId: number;
  name: string;
  from: number;
  latest: number;
  delta: number;
  ratio: number;
  points: PensionPoint[];
};

export type ScatterPoint = {
  companyId: number;
  name: string;
  subscribers: number;
  averageBaseIncome: number;
  annualPayroll: number;
};

export type DashboardSummary = {
  months: string[];
  facets: Facet[];
  ranking: RankEntry[];
  movers: { declining: RankEntry[]; growing: RankEntry[] };
  scatter: ScatterPoint[];
  uncovered: string[];
  covered: number;
  total: number;
};

const MOVER_LIMIT = 5;

function measured(points: PensionPoint[]) {
  return points.filter((point) => point.subscribers !== null);
}

function direction(delta: number | null): Direction {
  if (delta === null) return "unknown";
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

/**
 * 연금 시계열을 대시보드가 그릴 수 있는 형태로 접는다.
 * 스냅샷이 없는 기업은 버리지 않고 uncovered 로 남긴다 — 화면에서 빠지면 없는 줄 모르기 때문이다.
 */
export function buildDashboard(series: CompanySeries[]): DashboardSummary {
  const months = [...new Set(series.flatMap((entry) => entry.points.map((point) => point.ym)))].sort();

  const facets: Facet[] = [];
  const uncovered: string[] = [];

  for (const entry of series) {
    const known = measured(entry.points);
    if (known.length === 0) {
      uncovered.push(entry.name);
      continue;
    }

    const from = known[0].subscribers;
    const latest = known[known.length - 1].subscribers;
    const delta = known.length > 1 && from !== null && latest !== null ? latest - from : null;

    facets.push({
      companyId: entry.companyId,
      name: entry.name,
      points: entry.points,
      latest,
      from,
      delta,
      ratio: delta !== null && from ? delta / from : null,
      direction: direction(delta),
    });
  }

  const ranking = facets
    .filter((facet): facet is Facet & { from: number; latest: number; delta: number; ratio: number } =>
      facet.delta !== null && facet.ratio !== null && facet.from !== null && facet.latest !== null,
    )
    .map((facet) => ({
      companyId: facet.companyId,
      name: facet.name,
      from: facet.from,
      latest: facet.latest,
      delta: facet.delta,
      ratio: facet.ratio,
      points: facet.points,
    }))
    .sort((a, b) => a.ratio - b.ratio);

  const scatter: ScatterPoint[] = [];
  for (const facet of facets) {
    const last = measured(facet.points).at(-1);
    const subscribers = last?.subscribers ?? null;
    const noticeAmount = last?.noticeAmount ?? null;
    if (!subscribers || !noticeAmount) continue;

    scatter.push({
      companyId: facet.companyId,
      name: facet.name,
      subscribers,
      averageBaseIncome: Math.round(noticeAmount / subscribers / CONTRIBUTION_RATE),
      annualPayroll: Math.round((noticeAmount / CONTRIBUTION_RATE) * 12),
    });
  }

  const movers = {
    declining: ranking.filter((entry) => entry.ratio < 0).slice(0, MOVER_LIMIT),
    growing: [...ranking].reverse().filter((entry) => entry.ratio > 0).slice(0, MOVER_LIMIT),
  };

  return {
    months,
    facets,
    ranking,
    movers,
    scatter,
    uncovered,
    covered: facets.length,
    total: series.length,
  };
}

/**
 * 저장된 스냅샷으로 해당 연도의 대시보드 요약을 만든다.
 */
export async function getDashboardSummary(year: number) {
  return buildDashboard(await listPensionSeries(year));
}
