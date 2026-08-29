const FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * 최근 분석 시각을 KST 벽시계 `MM-DD HH:mm` 로 낸다.
 * ISO 문자열을 슬라이스하면 UTC 값이 그대로 벽시계처럼 보인다 — 반드시 타임존 변환을 거친다.
 */
export function formatRunTime(iso: string | null): string {
  if (!iso) return "—";
  const parts = FORMATTER.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
