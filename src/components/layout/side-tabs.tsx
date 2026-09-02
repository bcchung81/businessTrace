"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", index: "01", label: "동향" },
  { href: "/companies", index: "02", label: "기업" },
  { href: "/ranking", index: "03", label: "랭킹" },
  { href: "/history", index: "04", label: "이력" },
  { href: "/reports", index: "05", label: "리포트" },
] as const;

/**
 * 서류철 색인 탭 — 본문 종이의 왼쪽 가장자리에 꽂힌 책갈피. 절 번호와 이름을 세로로 적고, 현재 절만 흰 종이·primary 선으로 나온다.
 * 여백이 없는 화면에서는 본문 위로 접혀 가로 탭이 된다 — 세로 글자는 lg 이상에서만 쓴다. 연도는 URL 에서 받아 모든 탭에 붙인다 — 2025 를 보다가 탭을 누르면 2025 에 머문다.
 */
export function SideTabs({ year }: { year: string | null }) {
  const pathname = usePathname();
  const suffix = year ? `?year=${year}` : "";

  return (
    <nav aria-label="주요 메뉴" className="flex gap-1.5 lg:flex-col lg:gap-2">
      {NAV_ITEMS.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={`${item.href}${suffix}`}
            aria-current={current ? "page" : undefined}
            className="group flex items-center gap-2 border-[1.5px] border-hairline bg-surface px-3 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-l-[3px] aria-[current=page]:border-l-primary aria-[current=page]:bg-background aria-[current=page]:text-foreground lg:[writing-mode:vertical-rl] lg:gap-2.5 lg:border-l-0 lg:px-2.5 lg:py-4 lg:aria-[current=page]:-ml-px lg:aria-[current=page]:border-l-0 lg:aria-[current=page]:border-r-[3px] lg:aria-[current=page]:border-r-primary lg:aria-[current=page]:pr-2"
          >
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-primary lg:[writing-mode:vertical-rl]">{item.index}</span>
            <span className="font-display tracking-[0.02em]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * URL 의 `year` 쿼리를 읽어 SideTabs 에 넘긴다 — 네 자리 숫자가 아니면 무시한다.
 */
export function SideTabsFromUrl() {
  const year = useSearchParams().get("year");
  return <SideTabs year={/^\d{4}$/.test(year ?? "") ? year : null} />;
}
