import type { PensionPoint } from "@/lib/repositories/pensionSnapshot";
import type { RankEntry } from "@/lib/services/dashboardSummary";

type Row = {
  companyId: number;
  name: string;
  pct: number;
  from: number;
  latest: number;
  points: PensionPoint[];
};

const SPARK_W = 72;
const SPARK_H = 20;

function toRows(ranking: RankEntry[]): Row[] {
  return ranking.map((entry) => ({
    companyId: entry.companyId,
    name: entry.name,
    pct: Math.round(entry.ratio * 1000) / 10,
    from: entry.from,
    latest: entry.latest,
    points: entry.points,
  }));
}

/**
 * 월별 가입자수를 한 줄짜리 추이선으로 그린다.
 * 결측 월은 점을 찍지 않는다 - 이으면 없는 값을 있는 것처럼 보이게 한다.
 */
export function sparkPath(values: Array<number | null>, width = SPARK_W, height = SPARK_H) {
  const measured = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (measured.length === 0) return "";

  const low = Math.min(...measured);
  const high = Math.max(...measured);
  const step = measured.length > 1 ? width / (measured.length - 1) : 0;

  return measured
    .map((value, index) => {
      const x = (index * step).toFixed(1);
      const y = (high === low ? height / 2 : height - ((value - low) / (high - low)) * height).toFixed(1);
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

function Change({ pct }: { pct: number }) {
  const up = pct > 0;
  const flat = pct === 0;
  const colour = flat ? "text-muted-foreground" : up ? "text-tick-up" : "text-tick-down";
  const mark = flat ? "―" : up ? "▲" : "▼";

  return (
    <span className={`font-mono font-semibold tabular-nums ${colour}`}>
      {mark} {Math.abs(pct)}%
    </span>
  );
}

/**
 * 12개월 증감을 기업별 한 줄로 세우고 행마다 추이선을 붙인다.
 * 방향은 삼각형이 말한다 - 색은 보조다. 색만으로는 색각 이상에서 상승과 하락이 갈리지 않는다.
 */
export function GrowthRanking({ ranking }: { ranking: RankEntry[] }) {
  const rows = toRows(ranking);
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        두 달 이상 쌓인 기업이 없어 증감을 낼 수 없습니다.
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-background">
        <table className="w-full text-[12px]">
          <caption className="sr-only">12개월 가입자 증감</caption>
          <thead>
            <tr className="sticky top-0 z-10 border-b border-hairline bg-background text-[11px] text-muted-foreground">
              <th scope="col" className="px-3 py-1.5 text-left font-medium">기업</th>
              <th scope="col" className="px-3 py-1.5 text-left font-medium">추이</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">12개월 전</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">현재</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">증감</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.companyId} className="border-b border-hairline last:border-0">
                <td className="px-3 py-1.5">{row.name}</td>
                <td className="px-3 py-1.5">
                  <svg
                    role="img"
                    aria-label={`${row.name} 12개월 추이`}
                    width={SPARK_W}
                    height={SPARK_H}
                    viewBox={`-1 -1 ${SPARK_W + 2} ${SPARK_H + 2}`}
                    className="block"
                  >
                    <path
                      d={sparkPath(row.points.map((point) => point.subscribers))}
                      fill="none"
                      stroke={row.pct < 0 ? "var(--tick-down)" : "var(--tick-up)"}
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.from}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.latest}</td>
                <td className="px-3 py-1.5 text-right">
                  <Change pct={row.pct} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
}
