/**
 * 레이트리밋의 버킷 키로 쓸 접속 주소를 낸다.
 * `x-forwarded-for` 의 **마지막** 값을 쓴다 — 앞쪽은 클라이언트가 적어 보낼 수 있고, 마지막 하나만 우리 프록시가 붙인 것이다.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}
