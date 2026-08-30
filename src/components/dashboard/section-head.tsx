/**
 * 절 번호·제목·성격 표시·한 줄 설명을 한 덩어리로 세운다.
 * 표시가 없으면 어디까지가 실측이고 어디부터가 추정인지 화면에서 구분되지 않는다.
 */
export function SectionHead({
  index,
  title,
  tag,
  tone = "plain",
  note,
}: {
  index?: string;
  title: string;
  tag?: string;
  tone?: "plain" | "fresh";
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-3">
        {index ? (
          <span className="font-display text-[24px] font-black leading-none tracking-[-0.03em] tabular-nums">{index}</span>
        ) : null}
        <h2 className="font-display text-[18px] font-black tracking-[-0.02em]">{title}</h2>
        {tag ? (
          <span
            className={`border-[1.5px] px-2 py-[1px] text-[10.5px] font-bold tracking-[0.12em] ${
              tone === "fresh" ? "border-verified text-verified" : "border-ink text-foreground"
            }`}
          >
            {tag}
          </span>
        ) : null}
        {note ? <p className="text-[11.5px] text-muted-foreground">{note}</p> : null}
      </div>
    </div>
  );
}
