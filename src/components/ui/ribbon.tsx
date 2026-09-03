import { cn } from "@/lib/utils";
import { RibbonMenu } from "@/components/ui/ribbon-menu";
import type { RibbonGroup } from "@/lib/services/freshness";

/**
 * 기준일과 할 일을 primary 띠 하나로 잇는다. 정지 상태이고, 낡은 기준일은 색이 아니라 빗금으로 표시한다.
 * 목록을 가진 할 일은 그 자리에서 펼친다 — 펼치는 부분만 클라이언트다.
 */
export function Ribbon({ groups, className }: { groups: RibbonGroup[]; className?: string }) {
  return (
    <nav aria-label={groups.map((group) => group.label).join(" · ")} className={cn("bg-primary text-primary-foreground", className)}>
      <div className="flex min-h-9 w-full flex-wrap items-center gap-x-6 gap-y-1 px-6 py-1.5 font-display text-[12px] font-bold tabular-nums">
        {groups.map((group, index) => (
          <div key={group.label} className={cn("flex flex-wrap items-center gap-x-4", index > 0 && "border-l border-primary-foreground/35 pl-6")}>
            <span className="text-[10.5px] font-semibold tracking-[0.12em] text-primary-foreground/70">{group.label}</span>
            {group.items.map((item) =>
              item.menu ? (
                <RibbonMenu key={item.text} text={item.text} choices={item.menu} />
              ) : item.href ? (
                <a key={item.text} href={item.href} className="underline decoration-primary-foreground/60 underline-offset-4 hover:decoration-primary-foreground">
                  {item.text}
                </a>
              ) : (
                <span key={item.text} className={cn(item.stale && "hatch px-1.5")}>
                  {item.text}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
