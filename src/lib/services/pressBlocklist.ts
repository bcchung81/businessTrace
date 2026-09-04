import pressBlocklist from "@/lib/services/pressBlocklist.json";

const BLOCKED = pressBlocklist.domains;

/**
 * http(s) 링크의 호스트를 www. 없이 낸다. 형식이 아니면 null 이다.
 */
export function hostOf(link: string): string | null {
  try {
    const url = new URL(link);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 언론 보도가 아닌 도메인인지 본다. 하위 도메인도 막는다.
 * 테마주 사이트의 AI 생성 리포트가 기사로 통과한 적이 있다 — 형식이 멀쩡한 링크라도 출처가 아니면 근거가 아니다.
 */
export function isBlockedPress(host: string): boolean {
  return BLOCKED.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

/** 링크 기준으로 차단 여부를 본다. 형식이 아닌 링크는 차단이 아니라 별도 사유로 다룬다. */
export function isBlockedLink(link: string): boolean {
  const host = hostOf(link);
  return host !== null && isBlockedPress(host);
}
