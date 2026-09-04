import type { ReactNode } from "react";

/**
 * 상세 화면의 조작 줄 — 기업 간 이동은 왼쪽, 편집·재조회는 오른쪽에 두고 제목 아래 한 줄로 모은다.
 * 제목 옆에 붙여 두면 기업명이 길어질 때 조작이 밀려 잘린다. 내려 두면 제목은 제목만, 조작은 조작만 한다.
 */
export function DetailToolbar({ nav, actions }: { nav?: ReactNode; actions: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="기업 도구"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-hairline py-2"
    >
      <div className="flex flex-wrap items-center gap-3">{nav}</div>
      <div className="flex flex-wrap items-center gap-3">{actions}</div>
    </div>
  );
}
