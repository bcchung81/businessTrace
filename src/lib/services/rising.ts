import { METRIC_LABEL, type MetricKey, type MetricScore } from "@/lib/services/benchmarking";
import { prevPeriod } from "@/lib/services/periods";

/** 점수가 이만큼도 안 움직였으면 순위가 크게 뛰었어도 중위권 압축의 잡음이다. */
export const MIN_TOTAL_DELTA = 0.02;

export type ReasonKey = MetricKey | "risk";
export type MoveReason = { key: ReasonKey; label: string; delta: number };

export type RisingInput = { companyId: number; companyName: string; period: string; rank: number | null; total: number };
export type RisingRow = {
  companyId: number;
  companyName: string;
  prevRank: number;
  rank: number;
  delta: number;
  total: number;
  totalDelta: number | null;
  reason: MoveReason | null;
};

type Standing = { companyId: number; companyName: string; rank: number | null; total: number; metrics?: MetricScore[] };
type BaselineEntry = { companyId: number; rank: number | null; total?: number; metrics?: MetricScore[] };
type Baseline = BaselineEntry[];

/**
 * 지표별 총점 기여도를 낸다 — 결측을 뺀 가중치 합으로 나누는 산식을 그대로 따른다.
 */
function contributions(metrics: MetricScore[] | undefined): Map<MetricKey, number> {
  const present = (metrics ?? []).filter((metric) => metric.normalised !== null);
  const weightSum = present.reduce((sum, metric) => sum + metric.weight, 0);
  if (weightSum === 0) return new Map();
  return new Map(present.map((metric) => [metric.key, (metric.normalised as number) * (metric.weight / weightSum)]));
}

function labelOf(key: ReasonKey, up: boolean): string {
  if (key === "risk") return "리스크 감점";
  if (key === "verification") return "검증 상태 변경";
  return `${METRIC_LABEL[key]} ${up ? "상승" : "하락"}`;
}

/**
 * 총점이 왜 움직였는지를 지표 기여도 차이로 가른다. 지표 어느 것보다 큰 미설명 하락분은 리스크 감점으로 본다.
 * 순위 변동만으로는 기업이 나빠진 것인지 수집 창이 바뀐 것인지 구분되지 않는다.
 */
function reasonFor(current: Standing, base: BaselineEntry, totalDelta: number | null): MoveReason | null {
  if (totalDelta === null || !current.metrics || !base.metrics) return null;
  const live = contributions(current.metrics);
  const before = contributions(base.metrics);
  const keys = new Set<MetricKey>([...live.keys(), ...before.keys()]);

  const moves: MoveReason[] = [];
  let explained = 0;
  for (const key of keys) {
    const delta = (live.get(key) ?? 0) - (before.get(key) ?? 0);
    explained += delta;
    if (delta !== 0) moves.push({ key, label: labelOf(key, delta > 0), delta });
  }

  const sameWay = moves.filter((move) => (totalDelta > 0 ? move.delta > 0 : move.delta < 0));
  const leading = sameWay.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null;

  const residual = totalDelta - explained;
  if (residual < 0 && Math.abs(residual) > Math.abs(leading?.delta ?? 0)) {
    return { key: "risk", label: labelOf("risk", false), delta: residual };
  }
  return leading;
}

function rankMoves(current: Standing[], baseline: Baseline, keep: (prevRank: number, rank: number) => boolean, delta: (prevRank: number, rank: number) => number): RisingRow[] {
  const baseById = new Map<number, BaselineEntry>();
  for (const entry of baseline) {
    if (entry.rank !== null) baseById.set(entry.companyId, entry);
  }

  const rows: RisingRow[] = [];
  for (const entry of current) {
    if (entry.rank === null) continue;
    const base = baseById.get(entry.companyId);
    if (base?.rank == null || !keep(base.rank, entry.rank)) continue;

    const totalDelta = base.total === undefined ? null : entry.total - base.total;
    if (totalDelta !== null && Math.abs(totalDelta) < MIN_TOTAL_DELTA) continue;

    rows.push({
      companyId: entry.companyId,
      companyName: entry.companyName,
      prevRank: base.rank,
      rank: entry.rank,
      delta: delta(base.rank, entry.rank),
      total: entry.total,
      totalDelta,
      reason: reasonFor(entry, base, totalDelta),
    });
  }

  return rows.sort((a, b) => b.delta - a.delta || b.total - a.total || a.rank - b.rank);
}

/**
 * 현재 순위를 기준 순위와 대조해 상승 폭 순으로 낸다 — 양쪽 모두 순위가 있어야 추이다.
 */
export function compareRanks(current: Standing[], baseline: Baseline, limit = 10): RisingRow[] {
  return rankMoves(current, baseline, (prev, rank) => prev > rank, (prev, rank) => prev - rank).slice(0, limit);
}

/**
 * 기준 대비 순위가 내려간 기업을 하락 폭 순으로 낸다 — 리스크 검토의 출발점이다.
 */
export function fallingRanks(current: Standing[], baseline: Baseline, limit = 10): RisingRow[] {
  return rankMoves(current, baseline, (prev, rank) => prev < rank, (prev, rank) => rank - prev).slice(0, limit);
}

/**
 * 직전 확정 기간 대비 순위가 오른 기업 — 확정 기록끼리 비교하는 이력용 사슬이다.
 */
export function risingCompanies(records: RisingInput[], targetPeriod: string, limit = 10): RisingRow[] {
  const previous = prevPeriod(targetPeriod);
  return compareRanks(
    records.filter((record) => record.period === targetPeriod),
    records.filter((record) => record.period === previous),
    limit,
  );
}

/**
 * 확정 기준과 실시간 랭킹이 다른 산식으로 계산됐는지 알린다.
 * 산식이 바뀌면 순위 변동의 일부는 기업이 아니라 계산식이 움직인 것이다 — 그걸 성장으로 읽으면 안 된다.
 */
export function formulaDrift(baseline: string | null, current: string): string | null {
  if (!baseline || baseline === current) return null;
  return `산식이 ${baseline} → ${current} 로 바뀌어 변동에 계산식 변경이 섞여 있다`;
}
