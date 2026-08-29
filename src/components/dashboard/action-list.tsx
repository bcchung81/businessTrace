import Link from "next/link";
import type { ActionItem } from "@/lib/services/actionItems";

const CHIP_LIMIT = 4;

const TONE_CLASS: Record<ActionItem["tone"], string> = {
  review: "text-review",
  risk: "text-risk",
  plain: "text-foreground",
};

function Icon({ item }: { item: ActionItem }) {
  const common = { width: 14, height: 14, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true };
  switch (item.key) {
    case "businessNo":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    case "conflict":
      return <svg {...common}><circle cx="4" cy="6" r="2.6" /><circle cx="8" cy="6" r="2.6" /></svg>;
    case "stale":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    default:
      return <svg {...common}><path d="M1.5 3.5 5 7l2-2 3.5 3.5" /><path d="M10.5 6v2.5H8" /></svg>;
  }
}

/**
 * 조치 필요 항목을 건수·기업 칩·처방으로 세운다.
 * 0건도 행을 남긴다 — 항목이 사라지면 점검했는지 알 수 없다.
 */
export function ActionList({ items }: { items: ActionItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const shown = item.companies.slice(0, CHIP_LIMIT);
        const rest = item.companies.length - shown.length;
        return (
          <li key={item.key} aria-label={item.title} className="flex flex-col gap-2 border-b border-hairline px-4 py-3.5 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${TONE_CLASS[item.tone]}`}>
                <Icon item={item} />
                {item.title}
              </span>
              <span className={`font-mono text-[16px] font-semibold tabular-nums ${TONE_CLASS[item.tone]}`}>{item.count}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {shown.length === 0 ? (
                <span className="text-[11.5px] text-muted-foreground">없음</span>
              ) : (
                shown.map((company) => (
                  <Link
                    key={company.id}
                    href={`/companies/${company.id}`}
                    className="rounded-[5px] bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground hover:underline"
                  >
                    {company.name}
                    {company.detail ? <span className="ml-1 font-mono font-medium">{company.detail}</span> : null}
                  </Link>
                ))
              )}
              {rest > 0 ? <span className="text-[11.5px] text-muted-foreground">외 {rest}</span> : null}
            </div>
            <span className="text-[11.5px] text-muted-foreground">{item.remedy}</span>
          </li>
        );
      })}
    </ul>
  );
}
