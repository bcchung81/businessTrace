import type { ReactNode } from "react";
import { SectionHead } from "@/components/dashboard/section-head";

/**
 * 절 머리·본문·푸터를 한 문법으로 고정한다 — 상자 대신 4px 상단 괘선이 절을 나눈다.
 * 본문 패딩은 호출자가 준다 — 표는 가장자리까지 닿아야 한다.
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
    <section className={`flex min-h-0 flex-col gap-3.5 border-t-4 border-ink pt-2.5 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <SectionHead index={index} title={title} tag={tag} tone={tone} note={note} />
        {aside}
      </div>
      {hasBody ? (
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          {footer ? (
            <div
              data-testid="panel-footer"
              className="border-t border-dashed border-ink px-0 py-2.5 text-[11px] text-muted-foreground"
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
