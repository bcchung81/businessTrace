"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "동향" },
  { href: "/companies", label: "기업" },
  { href: "/ranking", label: "랭킹" },
] as const;

/**
 * 서류철 색인 탭 — 본문 왼쪽에 세로로 붙는 책갈피. 현재 절은 primary 선과 굵기로만 표시한다.
 * 좁은 화면에서는 위로 접혀 가로 탭이 된다 — 세로 글자는 sm 이상에서만 쓴다.
 */
export function SideTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="flex gap-1.5 sm:flex-col">
      {NAV_ITEMS.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className="flex items-center gap-2 border-[1.5px] border-hairline bg-surface px-3 py-2 font-display text-[12.5px] font-bold text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-l-[3px] aria-[current=page]:border-l-primary aria-[current=page]:bg-background aria-[current=page]:text-foreground sm:[writing-mode:vertical-rl] sm:border-l-0 sm:px-2 sm:py-4 sm:aria-[current=page]:border-l-[3px]"
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
