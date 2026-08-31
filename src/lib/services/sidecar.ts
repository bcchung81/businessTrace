const REQUEST_TIMEOUT_MS = 3000;

export type SidecarHealth = { status: string; features: Record<string, boolean> };
type Deps = { fetchImpl?: typeof fetch };

/**
 * 사이드카 호출 한 번 — 실패는 전부 null 이다.
 * 선택적 계층이라 죽어도 메인 기능이 서면 안 된다. 예외를 올리면 호출한 화면이 함께 넘어간다.
 */
async function call<T>(path: string, deps: Deps): Promise<T | null> {
  const base = process.env.SIDECAR_URL;
  if (!base) return null;

  try {
    const response = await (deps.fetchImpl ?? fetch)(`${base.replace(/\/$/, "")}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * 사이드카가 살아 있는지와 어떤 선택 기능이 설치돼 있는지 — 없으면 null 이다.
 */
export function sidecarHealth(deps: Deps = {}): Promise<SidecarHealth | null> {
  return call<SidecarHealth>("/health", deps);
}
