import { KST_OFFSET_MS } from "@/lib/services/kst";
import { STALE_DAYS } from "@/lib/services/newsCoverage";

const DAY_MS = 86_400_000;

/**
 * 월간 문서 요약 시트가 쓰는 수집 시점 묶음. 리본은 더 이상 이 형태를 쓰지 않는다.
 */
export type FreshnessInput = {
  now: Date;
  latestNewsAt: string | null;
  latestSourceAt: string | null;
  sourcesUpdatedToday: number;
  sourcesTotal: number;
  pensionYm: string | undefined;
  running: number;
  openEvents: number;
  stale: number;
};

export type RibbonItem = { text: string; href?: string; stale?: boolean };
export type RibbonGroup = { label: string; items: RibbonItem[] };

export type RibbonInput = {
  now: Date;
  latestNewsAt: string | null;
  fullSourceRefreshAt: string | null;
  pensionYm: string | undefined;
  reviewCompanies: number;
  openAlertNotice: number;
  needsReview: number;
  year: number;
};

/**
 * 다음 국민연금 스냅샷 적재일 — 최신 스냅샷 다음 달 15일이되, 이미 지났으면 다가오는 15일로 민다.
 * 공단은 매월 15일 이후에 전월치를 올린다 (CLAUDE.md). 지난 날짜를 "다음" 으로 보이면 안 된다.
 */
export function nextPensionDate(ym: string | undefined, now: Date) {
  if (!ym || ym.length !== 6) return "—";
  let year = Number(ym.slice(0, 4));
  let month = Number(ym.slice(4, 6)) + 1;
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  for (;;) {
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const candidate = Date.UTC(year, month - 1, 15);
    if (candidate >= Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())) break;
    month += 1;
  }
  return `${String(month).padStart(2, "0")}-15`;
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

function kstDay(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return { md: `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`, day: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
}

function dated(label: string, iso: string | null, now: Date): RibbonItem {
  if (!iso) return { text: `${label} —` };
  const { md, day } = kstDay(iso);
  const today = kstDay(now.toISOString()).day;
  const age = Math.round((today - day) / DAY_MS);
  const ageText = age <= 0 ? "오늘" : `${age}일 전`;
  const stale = age > STALE_DAYS;
  return { text: `${label} ${md} (${ageText})${stale ? " · 낡음" : ""}`, stale };
}

/**
 * 리본 두 묶음 — 이 화면의 숫자가 언제 것인지(기준일 3) 와 운영자가 지금 할 일(할 일 3).
 * 파이프라인 수치는 밴드가 보여주므로 여기 두지 않는다. 0 도 남긴다(§2-K).
 */
export function buildRibbonGroups(input: RibbonInput): RibbonGroup[] {
  return [
    {
      label: "기준일",
      items: [
        dated("뉴스", input.latestNewsAt, input.now),
        dated("원천", input.fullSourceRefreshAt, input.now),
        { text: `연금 ${monthLabel(input.pensionYm)} · 다음 적재 ${nextPensionDate(input.pensionYm, input.now)}` },
      ],
    },
    {
      label: "할 일",
      items: [
        { text: `확인 필요 ${input.reviewCompanies}개사`, href: `/companies?year=${input.year}&review=1` },
        { text: `미확인 경보·주의 ${input.openAlertNotice}`, href: `/dashboard?year=${input.year}#events` },
        { text: `검토 필요 ${input.needsReview}`, href: `/ranking?year=${input.year}` },
      ],
    },
  ];
}
