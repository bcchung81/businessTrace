import type { Contribution } from "@/lib/services/explainer";

function percent(share: number) {
  return `${Math.round(share * 100)}%`;
}

/**
 * 기여도 수평 막대 — 지표 이름·정규화 값·가중치·몫. 결측은 빗금 — 로 남겨 다섯 줄이 늘 보인다.
 * 총점이 없으면 막대를 그리지 않고 이유를 적는다 — 0% 막대 다섯 개는 결측이 아니라 무기여로 읽힌다.
 */
export function ContributionBars({ contributions, total }: { contributions: Contribution[]; total: number | null }) {
  if (total === null) {
    return <p className="py-3 text-[12.5px] text-muted-foreground">미분석 — 기여도를 낼 수 없다</p>;
  }
  return (
    <div className="flex flex-col gap-3 py-3">
      <p className="text-[11.5px] text-muted-foreground">
        총점 <b className="font-mono text-foreground">{total.toFixed(3)}</b> · 감점 전 점수를 100% 로 나눈 몫 · 합계 100%
      </p>
      <ul className="flex flex-col gap-2">
        {contributions.map((entry) => (
          <li key={entry.key} className="grid grid-cols-[56px_minmax(0,1fr)_140px] items-center gap-3 text-[12px]">
            <span className="font-bold">{entry.label}</span>
            <span className="relative block h-3 bg-surface">
              {entry.share === null ? (
                <span className="hatch absolute inset-0 text-center text-[10px] leading-3 text-muted-foreground">—</span>
              ) : (
                <span
                  role="img"
                  aria-label={`${entry.label} 기여도 ${percent(entry.share)}`}
                  className="absolute inset-y-0 left-0 bg-primary"
                  style={{ width: percent(entry.share) }}
                />
              )}
            </span>
            <span className="flex justify-end gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              <span>{entry.normalised === null ? "결측" : entry.normalised.toFixed(2)}</span>
              <span>×{entry.weight}</span>
              <b className="text-foreground">{entry.share === null ? "" : percent(entry.share)}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
