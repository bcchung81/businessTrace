import type { SourceCoverage } from "@/lib/repositories/sourceSnapshot";
import type { SourceKey } from "@/lib/services/sourceEvidence";

const SOURCE_NAME: Record<SourceKey, string> = {
  dart: "DART",
  dartFinance: "재무제표",
  fsc: "금융위",
  nts: "국세청",
  narajangteo: "나라장터",
  venture: "벤처확인",
  nps: "국민연금",
};

/**
 * 원천별 확인 기업 수를 막대로 세운다. 빈 구간은 빗금이다 — 결측 문법을 매트릭스와 맞춘다.
 * 전수 확인만 verified 색을 쓴다. 나머지는 primary 로 두어 상태색을 장식에 쓰지 않는다.
 */
export function SourceCoverageBars({ coverage }: { coverage: SourceCoverage }) {
  const rows = [...coverage.bySource].sort((left, right) => right.found - left.found);
  const width = (found: number) => (coverage.total === 0 ? 0 : Math.round((found / coverage.total) * 100));

  return (
    <div className="flex flex-1 flex-col gap-2.5 p-5">
      <p className="text-[11.5px] text-muted-foreground">원천별로 몇 개사를 확인했나. 빗금은 원천에 기업이 없는 결측이다.</p>
      <ul className="flex flex-col gap-2 pt-1">
        {rows.map((entry) => {
          const full = coverage.total > 0 && entry.found >= coverage.total;
          return (
            <li
              key={entry.source}
              aria-label={`${SOURCE_NAME[entry.source]} ${entry.found}/${coverage.total}`}
              className="grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-2.5"
            >
              <span className="text-[12px] font-medium">{SOURCE_NAME[entry.source]}</span>
              <div
                role="progressbar"
                aria-label={`${SOURCE_NAME[entry.source]} 확인`}
                aria-valuenow={entry.found}
                aria-valuemin={0}
                aria-valuemax={coverage.total}
                className="hatch relative h-2 overflow-hidden rounded bg-secondary"
              >
                <div
                  className={`h-full rounded ${full ? "bg-verified-fill" : "bg-primary"}`}
                  style={{ width: `${width(entry.found)}%` }}
                />
              </div>
              <span className={`text-right font-mono text-[12px] tabular-nums ${full ? "text-verified" : ""}`}>
                <b>{entry.found}</b>
                <span className="text-muted-foreground">/{coverage.total}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-hairline pt-2 text-[11.5px] text-muted-foreground">
        재무제표는 비상장·비외감이라 구조적 결측 — 나라장터 낙찰·연금 인건비가 대리지표다.
      </p>
    </div>
  );
}
