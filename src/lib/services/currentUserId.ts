import { auth } from "@/auth";

/**
 * 세션에서 현재 로그인한 관리자 ID를 뽑는다.
 * 세션이 없거나 id 가 양의 정수가 아니면 null — 호출부는 이를 unauthorized 로 다룬다.
 */
export async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = Number(session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
