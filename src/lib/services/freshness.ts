import { formatRunTime } from "@/lib/services/formatRunTime";

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

/**
 * 다음 국민연금 스냅샷 적재일을 낸다 — 최신 스냅샷 다음 달 15일.
 * 공단은 매월 15일 이후에 전월치를 올린다 (CLAUDE.md).
 */
export function nextPensionDate(ym: string | undefined) {
  if (!ym || ym.length !== 6) return "—";
  const month = Number(ym.slice(4, 6));
  const next = month === 12 ? 1 : month + 1;
  return `${String(next).padStart(2, "0")}-15`;
}

function monthLabel(ym: string | undefined) {
  return ym ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : "—";
}

/**
 * 리본에 흘릴 신선도·운영 상태 항목을 만든다.
 * 판정 수는 바로 아래 타일이 보여주므로 여기엔 화면 어디에도 없는 것만 둔다 — 언제 수집했고 지금 무엇이 도는지.
 */
export function buildFreshnessItems(input: FreshnessInput): string[] {
  const items = [
    `뉴스 ${formatRunTime(input.latestNewsAt)}`,
    `원천 ${formatRunTime(input.latestSourceAt)} · ${input.sourcesUpdatedToday}/${input.sourcesTotal}`,
    `연금 ${monthLabel(input.pensionYm)} · 다음 ${nextPensionDate(input.pensionYm)}`,
  ];
  if (input.running > 0) items.push(`실행 중 ${input.running}`);
  items.push(`미확인 사건 ${input.openEvents}`, `낡은 근거 ${input.stale}`);
  return items;
}
