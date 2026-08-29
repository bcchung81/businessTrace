import type { VerdictSummary } from "@/lib/services/verdictRollup";

type Gates = VerdictSummary["gates"];
type Dropouts = VerdictSummary["gateDropouts"];

const STEPS: Array<{ key: keyof Dropouts; label: string; cause: string }> = [
  { key: "source", label: "① 출처 인용", cause: "기사 링크 없음" },
  { key: "faithfulness", label: "② 근거충실도", cause: "기사 원문에 없는 수치" },
  { key: "evidence", label: "③ 근거 일치", cause: "공식 원천과 불일치" },
];

/**
 * 세 검증 게이트를 차례로 지나며 줄어드는 기업 수를 막대로 그린다.
 * 어느 게이트에서 떨어지는지가 처방을 정하므로 탈락 원인을 함께 적는다.
 */
export function GateFunnel({ gates, dropouts }: { gates: Gates; dropouts: Dropouts }) {
  const width = (passed: number) => (gates.analysed === 0 ? 0 : Math.round((passed / gates.analysed) * 100));

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <p className="text-[11.5px] text-muted-foreground">
        분석 {gates.analysed}개사가 세 게이트를 차례로 지난다. 어느 게이트에서 떨어지는지가 처방을 정한다.
      </p>
      <ul className="flex flex-col gap-3">
        {STEPS.map((step) => {
          const passed = gates[step.key];
          return (
            <li key={step.key} className="grid grid-cols-[96px_minmax(0,1fr)_72px] items-center gap-3">
              <span className="text-[12px] font-semibold">{step.label}</span>
              <div
                role="progressbar"
                aria-label={`${step.label} 통과`}
                aria-valuenow={passed}
                aria-valuemin={0}
                aria-valuemax={gates.analysed}
                className="h-[22px] overflow-hidden rounded-[5px] bg-secondary"
              >
                <div className="h-full rounded-[5px] bg-primary" style={{ width: `${width(passed)}%` }} />
              </div>
              <span className="text-right font-mono text-[12px] tabular-nums">
                <b>{passed}</b>
                <span className="text-muted-foreground">/{gates.analysed}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-3 gap-2.5 border-t border-hairline pt-3">
        {STEPS.map((step) => (
          <div key={step.key} className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground">{step.label.slice(0, 1)}에서 탈락</span>
            <span className="text-[12px]">{dropouts[step.key]}개사 · {step.cause}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
