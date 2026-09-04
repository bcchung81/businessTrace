export type Prefill = { email: string; password: string };

/**
 * 테스트 기간 로그인 자동채움 값 — 프로덕션에서는 무엇이 설정돼 있든 null 이다.
 * 로그인은 유일한 비인증 페이지라, 여기 렌더된 비밀번호는 누구나 소스 보기로 읽는다.
 * 이 판정은 반드시 서버에서 한다. 폼은 받은 값만 그린다.
 */
export function devAutofill(env: Record<string, string | undefined> = process.env): Prefill | null {
  if (env.NODE_ENV === "production") return null;

  const email = env.DEV_AUTOFILL_EMAIL?.trim() ?? "";
  const password = env.DEV_AUTOFILL_PASSWORD?.trim() ?? "";
  return email || password ? { email, password } : null;
}
