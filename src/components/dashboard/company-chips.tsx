import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/**
 * 기업을 사건 건수와 함께 칩으로 늘어놓는다. 비어 있으면 문장으로 알린다.
 */
export function CompanyChips({
  items,
  empty,
}: {
  items: Array<{ id: number; name: string; count: number }>;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="py-2 text-[12.5px] text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2.5 py-1">
      {items.map((item) => (
        <Link key={item.id} href={`/companies/${item.id}`}>
          <Badge variant="signal-outline" className="gap-2 py-1 pl-2.5 pr-0 text-[12.5px]">
            {item.name}
            <span className="bg-ink px-1.5 font-mono text-[11px] tabular-nums text-background">{item.count}</span>
          </Badge>
        </Link>
      ))}
    </div>
  );
}
