/**
 * 경로 세그먼트를 양의 정수 id 로 읽는다. 숫자가 아니면 null 이다.
 * NaN 을 그대로 Prisma 에 넘기면 404 로 끝날 요청이 500 으로 터진다.
 */
export function parseId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * year 쿼리 파라미터를 읽는다. 값이 없거나 비면 null 이다.
 * Number(null) 은 NaN 이 아니라 0 이라 정수 검사만으로는 누락을 잡지 못했다.
 */
export function parseYear(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}
