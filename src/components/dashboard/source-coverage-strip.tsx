import type { SourceCoverage } from "@/lib/repositories/sourceSnapshot";
import type { SourceKey } from "@/lib/services/sourceEvidence";

const SOURCE_NAME: Record<SourceKey, string> = {
  dart: "DART",
  dartFinance: "재무제표",
  fsc: "금융위",
  nts: "국세청",
  narajangteo: "나라장터",
  procurement: "조달 낙찰",
  venture: "벤처확인",
  nps: "국민연금",
};

/**
 * 원천별로 몇 개사를 확인했는지 한 줄로 낸다.
 * found 만 센다 - 결측·측정 불가·미조회는 커버리지가 아니다.
 */
export function SourceCoverageStrip({ coverage }: { coverage: SourceCoverage }) {
  return (
    <ul
      aria-label="원천별 확인 기업 수"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
    >
      {coverage.bySource.map((entry) => {
        const full = coverage.total > 0 && entry.found >= coverage.total;
        return (
          <li
            key={entry.source}
            aria-label={`${SOURCE_NAME[entry.source]} ${entry.found}/${coverage.total}`}
            className={full ? "text-verified" : undefined}
          >
            {SOURCE_NAME[entry.source]}{" "}
            <b className="font-mono font-bold tabular-nums">{entry.found}</b>
            <span className="font-mono tabular-nums opacity-60">/{coverage.total}</span>
          </li>
        );
      })}
    </ul>
  );
}
