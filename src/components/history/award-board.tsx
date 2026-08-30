import type { AwardCategory } from "@/lib/services/awards";

/**
 * 시상 카테고리 3칸 — 해당자가 없어도 칸을 비우지 않고 "해당 기업 없음"으로 말한다.
 */
export function AwardBoard({ categories }: { categories: AwardCategory[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {categories.map((category) => (
        <div key={category.id} className="border-t-2 border-ink pt-3">
          <h3 className="font-display text-[15px] font-black">{category.label}</h3>
          {category.winners.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">해당 기업 없음</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {category.winners.map((winner) => (
                <li key={winner.companyId} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-semibold">{winner.companyName}</span>
                  <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{winner.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
