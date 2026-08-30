import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/layout/wordmark";

const NAV_ITEMS = [
  { href: "/dashboard", label: "동향" },
  { href: "/companies", label: "기업" },
  { href: "/ranking", label: "랭킹" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-band text-band-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-8 border-b border-band-foreground/20 px-5">
          <Link href="/" className="flex items-center gap-3">
            <Wordmark height={22} />
            <span className="hidden text-[11px] text-band-foreground/65 sm:inline">우수기업 선정 근거 관리</span>
          </Link>

          <nav aria-label="주요 메뉴" className="ml-auto flex items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 text-[13px] font-bold text-band-foreground/65 transition-colors hover:bg-band-foreground/10 hover:text-band-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
