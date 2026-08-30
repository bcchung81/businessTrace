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

      <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-5 py-6 lg:py-8">
        <aside className="lg:absolute lg:right-full lg:top-8 lg:mr-0">
          <div className="lg:sticky lg:top-[72px]">
            <SideTabs />
          </div>
        </aside>
        <main className="min-w-0 flex-1 lg:-ml-5 lg:border-l lg:border-hairline lg:pl-5">{children}</main>
      </div>
    </div>
  );
}
