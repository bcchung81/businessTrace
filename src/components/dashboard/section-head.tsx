const TAG_HINT: Record<string, string> = {
  "실측": "원천·기사에서 그대로 읽은 값",
  "분석 산출": "LLM 분석이 만든 값 — 검증 판정을 함께 본다",
  "생성형": "요청할 때마다 새로 만든다",
  "실시간": "지금 저장된 값으로 다시 계산한 결과",
  "확정 기록": "시상 확정 당시 값 그대로",
  "자동 산출": "규칙으로 계산 — 사람이 정하지 않았다",
  "기록": "운영자가 남긴 파일·메모",
};

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
  tone?: "plain" | "fresh" | "review";
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
            title={TAG_HINT[tag]}
            className={`border-[1.5px] px-2 py-[1px] text-[10.5px] font-bold tracking-[0.12em] ${
              tone === "fresh" ? "border-verified text-verified" : tone === "review" ? "border-review text-review" : "border-ink text-foreground"
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
