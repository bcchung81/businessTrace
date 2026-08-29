const STATES = [
  { label: "확인", note: "값이 있다", swatch: "bg-verified-surface ring-1 ring-inset ring-verified" },
  { label: "결측", note: "원천에 이 기업이 없다", swatch: "hatch ring-1 ring-inset ring-border" },
  { label: "측정 불가", note: "조회는 됐고 잴 활동이 없다", swatch: "ring-1 ring-inset ring-muted-foreground" },
  { label: "미조회", note: "경로는 열려 있다", swatch: "bg-surface ring-1 ring-inset ring-hairline" },
  { label: "충돌", note: "다른 기업을 물어왔다", swatch: "bg-risk-surface ring-1 ring-inset ring-risk" },
];

/**
 * 빈칸 네 종류를 이름과 뜻으로 함께 세운다.
 * 색만으로는 결측과 측정 불가가 같은 회색으로 읽히는데, 둘은 처방이 정반대다.
 */
export function StateLegend() {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {STATES.map((state) => (
        <li
          key={state.label}
          className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[11.5px] text-muted-foreground"
        >
          <span aria-hidden className={`h-3.5 w-3.5 flex-none rounded ${state.swatch}`} />
          <b className="font-bold text-foreground">{state.label}</b>
          <span>{state.note}</span>
        </li>
      ))}
    </ul>
  );
}
