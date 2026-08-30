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
    return <p className="text-[12.5px] text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link key={item.id} href={`/companies/${item.id}`}>
          <Badge variant="ink" className="gap-1.5">
            {item.name}
            <span className="font-mono tabular-nums">{item.count}</span>
          </Badge>
        </Link>
      ))}
    </div>
  );
}
