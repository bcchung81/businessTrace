import { NEGATIVE_PRESS_MAX, POSITIVE_PRESS_MIN } from "@/lib/services/eventRules";

/** 사람 정답 기준 주제 판정이 이 값 이상이어야 ANALYZER=jev 를 기본으로 켠다. */
export const GATE_MIN = 0.95;

export type GateBasis = "human" | "gold";

export type AboutRow = { truth: boolean | null; about: boolean; held: boolean; confidence: number };

const Z = 1.96;

/**
 * 비율의 95% Wilson 구간. 표본이 작거나 비율이 끝에 붙어도 0~1 을 벗어나지 않는다.
 */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const denominator = 1 + (Z * Z) / n;
  const center = (p + (Z * Z) / (2 * n)) / denominator;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denominator;
  return [center - half, center + half];
}

/**
 * 확신도가 정답 양성과 음성을 얼마나 잘 가르는지 — 문턱과 무관한 순위 지표다.
 */
export function auc(scored: { y: boolean; s: number }[]): number {
  const positives = scored.filter((row) => row.y);
  const negatives = scored.filter((row) => !row.y);
  if (positives.length === 0 || negatives.length === 0) return Number.NaN;
  let wins = 0;
  for (const p of positives) for (const q of negatives) wins += p.s > q.s ? 1 : p.s === q.s ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}

/**
 * 우연히 맞을 몫을 뺀 일치도. 부정유형처럼 한 값에 쏠린 항목은 일치율보다 이것을 본다.
 */
export function cohenKappa(pairs: [string, string][]): number {
  const n = pairs.length;
  const labels = [...new Set(pairs.flat())];
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const expected = labels.reduce(
    (sum, label) => sum + (pairs.filter(([a]) => a === label).length / n) * (pairs.filter(([, b]) => b === label).length / n),
    0,
  );
  return expected === 1 ? 1 : (observed - expected) / (1 - expected);
}

function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1].value === order[start].value) end += 1;
    for (let k = start; k <= end; k += 1) result[order[k].index] = (start + end) / 2 + 1;
    start = end + 1;
  }
  return result;
}

/**
 * 순위상관. 감성은 두 분석기의 척도가 달라 값이 아니라 순서가 맞는지를 본다.
 */
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length < 2 || xs.length !== ys.length) return Number.NaN;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mean = (rx.length + 1) / 2;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < rx.length; i += 1) {
    covariance += (rx[i] - mean) * (ry[i] - mean);
    varianceX += (rx[i] - mean) ** 2;
    varianceY += (ry[i] - mean) ** 2;
  }
  if (varianceX === 0 || varianceY === 0) return Number.NaN;
  return covariance / Math.sqrt(varianceX * varianceY);
}

/**
 * 검토 페이지의 최종 판정을 정답으로 읽는다. "모르겠음"과 미판정은 채점에서 뺀다.
 */
export function humanTruth(label: { about?: string | null } | undefined): boolean | null {
  if (label?.about === "yes") return true;
  if (label?.about === "no") return false;
  return null;
}

/**
 * 주제 판정을 채점한다. 보류는 집계에서 빠지므로 "주제 아님"으로 세고, 보류를 뺀 확정분의 일치는 따로 낸다.
 */
export function scoreAbout<T extends AboutRow>(rows: T[]) {
  const judged = rows.filter((row) => row.truth !== null);
  const decisive = judged.filter((row) => !row.held);
  const misses = judged.filter((row) => row.about !== row.truth);
  return {
    n: judged.length,
    agree: judged.length - misses.length,
    held: judged.length - decisive.length,
    decisive: { n: decisive.length, agree: decisive.filter((row) => row.about === row.truth).length },
    auc: auc(judged.map((row) => ({ y: row.truth === true, s: row.confidence }))),
    misses,
  };
}

/**
 * 층화 표본의 정확도를 모집단 크기로 가중해 전체 정확도를 추정한다.
 * 검토된 기사가 없는 층은 추정에서 빠지고 이름으로 알린다 — 빈 층을 맞았다고도 틀렸다고도 볼 수 없다.
 */
export function stratifiedAccuracy(rows: { stratum: string; correct: boolean }[], sizes: Record<string, number>) {
  let weighted = 0;
  let covered = 0;
  const missing: string[] = [];
  for (const [stratum, size] of Object.entries(sizes)) {
    const reviewed = rows.filter((row) => row.stratum === stratum);
    if (reviewed.length === 0) {
      missing.push(stratum);
      continue;
    }
    weighted += size * (reviewed.filter((row) => row.correct).length / reviewed.length);
    covered += size;
  }
  return { estimate: covered === 0 ? Number.NaN : weighted / covered, missing };
}

/**
 * 감성 점수가 긍정·부정 보도 사건을 만드는지. 사건 문턱과 같은 값을 쓴다.
 */
export function sentimentEvent(score: number): "positive" | "negative" | "none" {
  if (score >= POSITIVE_PRESS_MIN) return "positive";
  if (score <= NEGATIVE_PRESS_MAX) return "negative";
  return "none";
}

/**
 * Sonnet 기준 채점은 참고치다 — 1차 게이트에서 Sonnet 정답 자체가 오염돼 있었다.
 */
export function passesGate(accuracy: number, basis: GateBasis): boolean {
  return basis === "human" && accuracy >= GATE_MIN;
}
