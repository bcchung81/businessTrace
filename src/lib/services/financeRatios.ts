import type { FinancialFigures } from "@/lib/services/dart";

/** 값이 없는 것과, 값을 낼 수 없는 사정이 있는 것을 구분한다 — 둘 다 null 로 두면 결측처럼 읽힌다. */
export type Ratio = { value: number | null; note: string | null };

export type FinanceRatios = { debtRatio: Ratio; roe: Ratio; operatingMargin: Ratio };

const missing: Ratio = { value: null, note: null };

/**
 * 분모가 양수일 때만 나눈다. 0 이하는 사유를 이름으로 남긴다.
 */
function divide(numerator: number | null, denominator: number | null, whenNotPositive: string): Ratio {
  if (numerator === null || denominator === null) return missing;
  if (denominator <= 0) return { value: null, note: whenNotPositive };
  return { value: numerator / denominator, note: null };
}

/**
 * 재무 3비율을 낸다 — 부채비율(부채/자본) · ROE(순이익/자본) · 영업이익률(영업이익/매출).
 * 자본이 0 이하면 숫자는 나오지만 뜻이 뒤집힌다(음수 자본에 순손실이면 ROE 가 양수다). 그래서 자본잠식이라고 적는다.
 */
export function financeRatios(figures: FinancialFigures): FinanceRatios {
  return {
    debtRatio: divide(figures.totalLiabilities, figures.totalEquity, "자본잠식"),
    roe: divide(figures.netIncome, figures.totalEquity, "자본잠식"),
    operatingMargin: divide(figures.operatingIncome, figures.revenue, "매출 없음"),
  };
}
