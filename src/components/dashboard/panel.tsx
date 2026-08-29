import type { ReactNode } from "react";
import { SectionHead } from "@/components/dashboard/section-head";

/**
 * 절 머리·카드 본문·푸터 띠를 한 문법으로 고정한다.
 * 카드마다 테두리·여백이 다르면 스캔이 끊긴다. 본문 패딩은 호출자가 준다 — 표는 가장자리까지 닿아야 한다.
 */
export function Panel({
  index,
  title,
  tag,
  tone,
  note,
  aside,
  footer,
  empty = "표시할 내용이 없습니다.",
  className = "",
  children,
}: {
  index?: string;
  title: string;
  tag?: string;
  tone?: "plain" | "fresh";
  note?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  empty?: string;
  className?: string;
  children?: ReactNode;
}) {
  const hasBody = children !== null && children !== undefined && children !== false;

  return (
    <section className={`flex min-h-0 flex-col gap-3.5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <SectionHead index={index} title={title} tag={tag} tone={tone} note={note} />
        {aside}
      </div>
      {hasBody ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-background shadow-[0_1px_2px_rgba(23,23,25,0.04)]">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          {footer ? (
            <div
              data-testid="panel-footer"
              className="border-t border-border bg-surface px-3.5 py-2 text-[11px] text-muted-foreground"
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
