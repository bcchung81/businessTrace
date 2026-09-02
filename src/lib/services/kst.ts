export const KST_OFFSET_MS = 9 * 3_600_000;

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function kstParts(iso: string): { year: string; month: string; day: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = DATE_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * ISO 시각을 KST 벽시계 날짜 `YYYY-MM-DD` 로 낸다 — UTC 로 슬라이스하면 자정 근처 날짜가 하루 어긋난다.
 */
export function kstDate(iso: string): string {
  const parts = kstParts(iso);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : iso;
}

/**
 * ISO 시각을 KST 벽시계 날짜 `MM-DD` 로 낸다.
 */
export function kstMonthDay(iso: string): string {
  const parts = kstParts(iso);
  return parts ? `${parts.month}-${parts.day}` : iso.slice(5, 10);
}

/**
 * 올해면 `MM-DD`, 다른 해면 `YYYY-MM-DD` — 코호트 화면에서 해가 넘어간 날짜가 올해 것으로 읽히지 않게.
 */
export function kstDateShort(iso: string, now: Date = new Date()): string {
  const parts = kstParts(iso);
  if (!parts) return iso.slice(0, 10);
  const thisYear = kstParts(now.toISOString())?.year;
  return parts.year === thisYear ? `${parts.month}-${parts.day}` : `${parts.year}-${parts.month}-${parts.day}`;
}
