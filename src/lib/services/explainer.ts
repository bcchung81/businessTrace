import { METRIC_LABEL, type BenchmarkRow, type MetricKey } from "@/lib/services/benchmarking";

export type Contribution = { key: MetricKey; label: string; normalised: number | null; weight: number; share: number | null };

/**
 * 총점(감점 전)을 지표별 몫으로 가른다 — 값 있는 지표의 normalised×weight 합을 100% 로 본다.
 * 결측 지표는 지우지 않고 share null 로 남긴다. 합이 0 이면 전부 0 이다.
 */
export function explainScore(row: BenchmarkRow): Contribution[] {
  const present = row.metrics.filter((metric) => metric.normalised !== null);
  const weightSum = present.reduce((acc, metric) => acc + metric.weight, 0);
  const raw = row.metrics.map((metric) =>
    metric.normalised === null || weightSum === 0 ? null : metric.normalised * (metric.weight / weightSum),
  );
  const rawSum = raw.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return row.metrics.map((metric, index) => ({
    key: metric.key,
    label: METRIC_LABEL[metric.key],
    normalised: metric.normalised,
    weight: metric.weight,
    share: raw[index] === null ? null : rawSum === 0 ? 0 : (raw[index] as number) / rawSum,
  }));
}
