import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "동향" },
  { href: "/companies", label: "기업" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-surface text-foreground">
      <header className="sticky top-0 z-10 border-b border-hairline bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-5">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-[-0.03em]">성과돋보기</span>
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
              우수기업 선정 근거 관리
            </span>
          </Link>

          <nav aria-label="주요 메뉴" className="flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
