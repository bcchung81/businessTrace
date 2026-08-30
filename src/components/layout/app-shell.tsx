import Link from "next/link";
import type { ReactNode } from "react";
import { SideTabs } from "@/components/layout/side-tabs";
import { Wordmark } from "@/components/layout/wordmark";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-band text-band-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-8 border-b border-band-foreground/20 px-5">
          <Link href="/" className="flex items-center gap-3">
            <Wordmark height={22} />
            <span className="hidden text-[11px] text-band-foreground/65 sm:inline">우수기업 선정 근거 관리</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-5 py-6 sm:flex-row sm:gap-6 sm:py-8">
        <aside className="sm:sticky sm:top-[72px] sm:self-start">
          <SideTabs />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
