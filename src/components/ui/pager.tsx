"use client";

export const LIST_PAGE_SIZE = 20;

/**
 * 리스트 화면 공용 페이지 자르기 — 20개 단위, 범위를 벗어난 페이지는 마지막 페이지로 죈다.
 */
export function paginate<T>(rows: T[], page: number, size = LIST_PAGE_SIZE): { slice: T[]; pages: number; current: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(page, 0), pages - 1);
  return { slice: rows.slice(current * size, current * size + size), pages, current };
}

/**
 * 이전 · n / m · 다음 — 한 페이지뿐이면 아무것도 그리지 않는다.
 */
export function Pager({ current, pages, onPage, className = "" }: { current: number; pages: number; onPage: (page: number) => void; className?: string }) {
  if (pages <= 1) return null;
  return (
    <div className={`flex items-center justify-end gap-2 border-t border-dashed border-ink px-0 py-2 text-[11px] text-muted-foreground ${className}`}>
      <button
        type="button"
        onClick={() => onPage(current - 1)}
        disabled={current === 0}
        className="border-[1.5px] border-hairline bg-background px-2.5 py-0.5 font-bold disabled:opacity-40"
      >
        이전
      </button>
      <span className="font-mono tabular-nums">
        {current + 1} / {pages}
      </span>
      <button
        type="button"
        onClick={() => onPage(current + 1)}
        disabled={current >= pages - 1}
        className="border-[1.5px] border-hairline bg-background px-2.5 py-0.5 font-bold disabled:opacity-40"
      >
        다음
      </button>
    </div>
  );
}
