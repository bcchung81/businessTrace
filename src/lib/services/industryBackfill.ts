import type { StoredSnapshot } from "@/lib/repositories/sourceSnapshot";

const NUMERIC_CODE = /^\d+$/;
const PLACEHOLDER = /미존재/;

/**
 * 업종 칸이 채울 대상인지 판정한다 — 비었거나 숫자 코드만 있으면 이름이 아니다.
 */
export function needsIndustry(industry: string | null): boolean {
  const name = (industry ?? "").trim();
  return name === "" || NUMERIC_CODE.test(name);
}

function industryOf(snapshots: StoredSnapshot[], source: StoredSnapshot["source"]): string | null {
  const snap = snapshots.find((row) => row.source === source && row.status === "found");
  const name = ((snap?.payload as { industry?: string } | null)?.industry ?? "").trim();
  if (name === "" || PLACEHOLDER.test(name)) return null;
  return name;
}

/**
 * 원천 스냅샷에서 업종명을 고른다. 벤처확인 업종명(11차)을 우선하고 국민연금 업종명으로 보완한다.
 */
export function pickIndustry(snapshots: StoredSnapshot[]): string | null {
  return industryOf(snapshots, "venture") ?? industryOf(snapshots, "nps");
}
