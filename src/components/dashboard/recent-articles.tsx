import type { MentionedArticle } from "@/lib/services/coMention";

const DAY_MS = 86_400_000;
const GROUPS = [
  { label: "이번 주", maxDays: 7 },
  { label: "지난 주", maxDays: 14 },
  { label: "그 이전", maxDays: Number.POSITIVE_INFINITY },
];

function monthDay(published: string) {
  return published.slice(5, 10);
}

function groupOf(published: string, now: Date) {
  const age = (now.getTime() - Date.parse(published)) / DAY_MS;
  return GROUPS.find((group) => age <= group.maxDays)?.label ?? GROUPS[GROUPS.length - 1].label;
}

/**
 * 수집한 기사를 최신순으로 세우고 주 단위로 묶어, 그 기사가 다루는 등록 기업을 함께 붙인다.
 * 심사에서 먼저 찾는 것은 관계 요약이 아니라 최근에 무슨 일이 있었는지다.
 */
export function RecentArticles({
  articles,
  now = new Date(),
  emptyLabel = "수집된 기사가 없습니다.",
}: {
  articles: MentionedArticle[];
  now?: Date;
  emptyLabel?: string;
}) {
  if (articles.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  const grouped = GROUPS.map((group) => ({
    label: group.label,
    items: articles.filter((entry) => groupOf(entry.published, now) === group.label),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul aria-label="최근 기사" className="flex flex-col">
        {grouped.map((group) => (
          <li key={group.label} className="contents">
            <h3 className="border-b border-hairline bg-surface px-3.5 py-1.5 text-[10.5px] font-bold tracking-[0.08em] text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((entry) => (
                <li key={entry.link} className="grid grid-cols-[48px_76px_minmax(0,1fr)_auto] items-baseline gap-2.5 border-b border-hairline px-3.5 py-2 last:border-0">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{monthDay(entry.published)}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{entry.source}</span>
                  <a href={entry.link} target="_blank" rel="noreferrer" className="truncate text-[12.5px] font-medium underline-offset-2 hover:underline">
                    {entry.title}
                  </a>
                  <span className="flex gap-1">
                    {entry.companies.map((name) => (
                      <span key={name} className="rounded-[5px] bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                        {name}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
