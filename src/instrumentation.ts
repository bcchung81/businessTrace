/**
 * 서버가 요청을 받기 전에 한 번 돈다.
 * 노드 전용 코드는 별도 모듈로 미룬다 — register 는 엣지 런타임으로도 컴파일되고,
 * 거기 `process.exit` 가 보이면 빌드가 경고를 낸다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootNodeServer } = await import("@/instrumentation-node");
  await bootNodeServer();
}
