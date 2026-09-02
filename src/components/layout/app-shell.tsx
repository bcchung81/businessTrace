import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { BatchIndicator } from "@/components/layout/batch-indicator";
import { SideTabs, SideTabsFromUrl } from "@/components/layout/side-tabs";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { BatchStatus } from "@/lib/services/batchRegistry";
import { Wordmark } from "@/components/layout/wordmark";

export function AppShell({ children, batch = null }: { children: ReactNode; batch?: BatchStatus | null }) {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-band text-band-foreground">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-8 border-b border-hairline px-5">
          <Link href="/" className="flex items-center gap-3">
            <Wordmark height={22} />
            <span className="hidden text-[11px] text-band-foreground/65 sm:inline">우수기업 선정 근거 관리</span>
          </Link>
          <BatchIndicator initial={batch} />
          <ThemeToggle />
        </div>
      </header>

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-5 py-6 lg:py-8">
        <aside className="lg:fixed lg:right-[max(0.5rem,calc(50%-32rem-3.25rem))] lg:top-[72px] lg:z-10">
          <Suspense fallback={<SideTabs year={null} />}>
            <SideTabsFromUrl />
          </Suspense>
        </aside>
        <main className="min-w-0 flex-1 lg:-ml-5 lg:border-l lg:border-hairline lg:pl-5">{children}</main>
      </div>
    </div>
  );
}
