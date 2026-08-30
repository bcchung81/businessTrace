import { cn } from "@/lib/utils";

/**
 * 신선도·운영 상태를 primary 띠 하나로 잇는다. 정지 상태다.
 * 시선을 잡는 장치는 화면에 하나면 충분하다 — 표 위에는 두지 않는다.
 */
export function Ribbon({ items, className }: { items: string[]; className?: string }) {
  return (
    <div
      role="img"
      aria-label={items.join(" · ")}
      className={cn("mx-[calc(50%-50vw)] bg-primary text-primary-foreground", className)}
    >
      <div aria-hidden="true" className="mx-auto flex h-9 w-full max-w-5xl items-center overflow-x-auto whitespace-nowrap px-5 font-display text-[12px] font-bold tabular-nums">
        {items.map((item, index) => (
          <span key={index} className="border-r border-primary-foreground/35 pr-[18px] mr-[18px] last:mr-0 last:border-0 last:pr-0">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
