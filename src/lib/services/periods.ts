export type PeriodKind = "year" | "half" | "quarter";

const HALF = /^(\d{4})-H([12])$/;
const QUARTER = /^(\d{4})-Q([1-4])$/;

export function periodKindOf(period: string): PeriodKind {
  if (HALF.test(period)) return "half";
  if (QUARTER.test(period)) return "quarter";
  return "year";
}

export function periodYear(period: string): number {
  return Number(period.slice(0, 4));
}

/**
 * 기간의 끝 달을 YYYYMM 으로 낸다 — 월 축 위에 기간 점수를 놓는 기준점이다.
 */
export function periodEndYm(period: string): string {
  const year = period.slice(0, 4);
  const half = period.match(HALF);
  if (half) return `${year}${half[2] === "1" ? "06" : "12"}`;
  const quarter = period.match(QUARTER);
  if (quarter) return `${year}${String(Number(quarter[2]) * 3).padStart(2, "0")}`;
  return `${year}12`;
}

/**
 * 같은 단위의 직전 기간 — 연속 수상·전기 대비 성장 산출이 이 사슬을 따른다.
 */
export function prevPeriod(period: string): string {
  const half = period.match(HALF);
  if (half) return half[2] === "2" ? `${half[1]}-H1` : `${Number(half[1]) - 1}-H2`;
  const quarter = period.match(QUARTER);
  if (quarter) return quarter[2] === "1" ? `${Number(quarter[1]) - 1}-Q4` : `${quarter[1]}-Q${Number(quarter[2]) - 1}`;
  return String(periodYear(period) - 1);
}

export function periodsOfYear(year: number, kind: PeriodKind): string[] {
  if (kind === "half") return [`${year}-H1`, `${year}-H2`];
  if (kind === "quarter") return [1, 2, 3, 4].map((q) => `${year}-Q${q}`);
  return [String(year)];
}

export function periodLabel(period: string): string {
  const half = period.match(HALF);
  if (half) return `${half[1]} ${half[2] === "1" ? "상반기" : "하반기"}`;
  const quarter = period.match(QUARTER);
  if (quarter) return `${quarter[1]} ${quarter[2]}분기`;
  return `${period}년`;
}
