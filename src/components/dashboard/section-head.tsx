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
      <div className="flex flex-wrap items-baseline gap-2">
        {index ? (
          <span className="font-mono text-[11px] font-semibold text-primary">{index}</span>
        ) : null}
        <h2 className="text-[15px] font-bold tracking-[-0.025em]">{title}</h2>
        {tag ? (
          <span
            className={`rounded-full border px-2 py-[1px] text-[10.5px] font-bold tracking-[0.08em] ${
              tone === "fresh"
                ? "border-verified/40 bg-verified-surface text-verified"
                : "border-border bg-background text-muted-foreground"
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
