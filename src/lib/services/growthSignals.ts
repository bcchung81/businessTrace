import type { PensionPoint } from "@/lib/repositories/pensionSnapshot";

/** 조달 낙찰의 연도별 집계 한 줄 — ProcurementSummary.years 의 원소와 같은 모양이다. */
export type AwardYear = { year: number; count: number; total: number };

/** 최근 창과 직전 창을 각각 몇 년으로 잡는지. 조달은 해가 걸러지는 일이 흔해 2년씩 묶는다. */
const WINDOW_YEARS = 2;
/** 이보다 짧은 구간을 연 환산하면 한 달의 흔들림이 연간 성장으로 부풀려진다. */
const MIN_SPAN_MONTHS = 6;

/**
 * 전년 대비 증가율. 분모가 0 이하면 결측이다 — 비율의 뜻이 뒤집히거나 나눌 수 없다.
 * 결측을 0 으로 적으면 "성장 없음"으로 읽혀 못 잰 것이 판정이 된다.
 */
export function growthRate(current: number | null, previous: number | null | undefined): number | null {
  if (current === null || previous === null || previous === undefined || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100) / 100;
}

const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6));

/**
 * 국민연금 가입자 수의 연간 증감.
 * 12개월 전 같은 달이 있으면 그것과 비교한다 — 채용이 몰리는 달이 있어 인접 달과 재면 계절성이 성장으로 보인다.
 * 없으면 가진 구간으로 재어 연 환산한다. 원천이 12개월치만 유지해 매달 쌓기 시작한 초기에는 13개월 창이 아예 없다.
 */
export function headcountGrowth(points: PensionPoint[]): number | null {
  const measured = [...points].filter((point) => point.subscribers !== null).sort((a, b) => a.ym.localeCompare(b.ym));
  const latest = measured.at(-1);
  const earliest = measured[0];
  if (!latest || !earliest || latest === earliest) return null;

  const yearAgo = measured.find((point) => point.ym === `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4)}`);
  if (yearAgo) return growthRate(latest.subscribers, yearAgo.subscribers);

  const span = monthIndex(latest.ym) - monthIndex(earliest.ym);
  if (span < MIN_SPAN_MONTHS || earliest.subscribers === null || earliest.subscribers <= 0) return null;
  const annualised = (latest.subscribers! / earliest.subscribers) ** (12 / span) - 1;
  return Math.round(annualised * 100) / 100;
}

/**
 * 공공조달 수주액의 최근 2년 대 직전 2년 증감 — 재무 결측 기업의 매출 추세 대리지표다.
 * 직전 창에 수주가 없으면 결측이다. 0 에서 늘어난 것을 무한 성장으로 적을 수는 없다.
 */
export function procurementGrowth(years: AwardYear[], now: Date = new Date()): number | null {
  if (years.length === 0) return null;

  const thisYear = now.getUTCFullYear();
  const sum = (from: number, to: number) =>
    years.filter((row) => row.year >= from && row.year <= to).reduce((acc, row) => acc + row.total, 0);

  const recent = sum(thisYear - WINDOW_YEARS + 1, thisYear);
  const earlier = sum(thisYear - WINDOW_YEARS * 2 + 1, thisYear - WINDOW_YEARS);
  return growthRate(recent, earlier);
}

/**
 * 연간 입·퇴사 순증을 평균 인원 대비 비율로 낸다 — 고용 증감(잔고)을 흐름 쪽에서 다시 보는 신호다.
 * 입사·퇴사가 둘 다 보고된 달만 세고 연 환산한다. 한쪽만 있는 달을 0 으로 채우면 순증이 거짓으로 커진다.
 */
export function hiringBalance(points: PensionPoint[]): number | null {
  const reported = points.filter((point) => point.hired !== null && point.departed !== null && point.subscribers !== null);
  if (reported.length < MIN_SPAN_MONTHS) return null;

  const net = reported.reduce((acc, point) => acc + (point.hired! - point.departed!), 0);
  const base = reported.reduce((acc, point) => acc + point.subscribers!, 0) / reported.length;
  if (base <= 0) return null;

  return Math.round((net / base) * (12 / reported.length) * 100) / 100;
}
