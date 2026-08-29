import { cn } from "@/lib/utils";

/**
 * 상태 요약을 기울인 띠 하나로 흘린다.
 * 시선을 잡는 장치는 화면에 하나면 충분하다 — 표 위에는 두지 않는다.
 */
export function Ribbon({ items, className }: { items: string[]; className?: string }) {
  const run = [...items, ...items, ...items];
  return (
    <div
      aria-label={items.join(" · ")}
      className={cn(
        "-mx-5 -rotate-1 overflow-hidden border-y-2 border-ink bg-primary py-1.5 text-primary-foreground",
        className,
      )}
    >
      <div aria-hidden="true" className="ribbon-drift flex w-max whitespace-nowrap font-display text-[13px] uppercase tracking-[0.07em]">
        {run.map((item, index) => (
          <span key={index} className="flex items-center gap-4 px-4">
            {item}
            <span className="text-[10px]">★</span>
          </span>
        ))}
      </div>
    </div>
  );
}
