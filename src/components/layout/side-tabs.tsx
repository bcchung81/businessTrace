"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", index: "01", label: "동향" },
  { href: "/companies", index: "02", label: "기업" },
  { href: "/ranking", index: "03", label: "랭킹" },
] as const;

/**
 * 서류철 색인 탭 — 본문 종이의 왼쪽 가장자리에 꽂힌 책갈피. 절 번호와 이름을 세로로 적고, 현재 절만 흰 종이·primary 선으로 나온다.
 * 여백이 없는 화면에서는 본문 위로 접혀 가로 탭이 된다 — 세로 글자는 lg 이상에서만 쓴다.
 */
export function SideTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="flex gap-1.5 lg:flex-col lg:gap-2">
      {NAV_ITEMS.map((item) => {
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className="group flex items-center gap-2 border-[1.5px] border-hairline bg-surface px-3 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-l-[3px] aria-[current=page]:border-l-primary aria-[current=page]:bg-background aria-[current=page]:text-foreground lg:[writing-mode:vertical-rl] lg:gap-2.5 lg:border-r-0 lg:px-2.5 lg:py-4 lg:aria-[current=page]:-mr-px lg:aria-[current=page]:border-l-[3px] lg:aria-[current=page]:pl-2"
          >
            <span className="font-mono text-[10.5px] font-semibold tracking-[0.08em] text-primary lg:[writing-mode:vertical-rl]">{item.index}</span>
            <span className="font-display tracking-[0.02em]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
