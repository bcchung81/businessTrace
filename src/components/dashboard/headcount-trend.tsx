"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { Direction, Facet } from "@/lib/services/dashboardSummary";

const DIRECTION_LABEL: Record<Direction, string> = {
  up: "증가",
  down: "감소",
  flat: "변동 없음",
  unknown: "추이 없음",
};

const DIRECTION_COLOR: Record<Direction, string> = {
  up: "var(--verified)",
  down: "var(--risk)",
  flat: "var(--muted-foreground)",
  unknown: "var(--muted-foreground)",
};

function label(ym: string) {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

function percent(ratio: number | null) {
  if (ratio === null) return "—";
  const value = Math.round(ratio * 100);
  return `${value > 0 ? "+" : ""}${value}%`;
}

/**
 * 기업마다 작은 차트를 하나씩 둔다.
 * 한 축에 여러 선을 겹치면 색만으로 기업을 갈라야 하는데, 그 색은 색각 이상에서 구분되지 않는다.
 */
export function HeadcountTrend({ facets }: { facets: Facet[] }) {
  if (facets.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
        저장된 연금 스냅샷이 없습니다. <code className="font-mono">npx tsx scripts/collect-pension.ts</code> 를 먼저 실행하세요.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facets.map((facet) => (
        <li key={facet.companyId} className="border-t-2 border-ink bg-background pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">{facet.name}</span>
            <span className="font-mono text-[16px] font-bold tabular-nums">{facet.latest ?? "—"}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {facet.points.length}개월 · {DIRECTION_LABEL[facet.direction]}
            </span>
            <span style={{ color: DIRECTION_COLOR[facet.direction] }} className="font-mono font-semibold">
              {percent(facet.ratio)}
            </span>
          </div>
          <div className="mt-2 h-[52px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={facet.points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  labelFormatter={(ym) => label(String(ym ?? ""))}
                  formatter={(value) => [`${value}명`, "가입자"] as [string, string]}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="subscribers"
                  name="가입자"
                  stroke={DIRECTION_COLOR[facet.direction]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
            {facet.points.length > 0
              ? `${label(facet.points[0].ym)} ~ ${label(facet.points[facet.points.length - 1].ym)} · 세로축 0부터`
              : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * 기업명 옆에 붙는 고용 규모 요약 — 인원·방향(말로)·증감률·스파크라인·기간을 한 줄에.
 * 스냅샷이 없으면 빈 차트 대신 "없음" 이라고 적는다.
 */
export function HeadcountInline({ facet }: { facet: Facet | null }) {
  return (
    <div role="group" aria-label={`고용 규모 ${facet ? `${facet.points.length}개월` : "없음"}`} className="flex items-center gap-3 border-l-2 border-ink pl-3 text-[11px] text-muted-foreground">
      {facet ? (
        <>
          <div className="flex flex-col">
            <span className="font-bold tracking-[0.06em]">가입자</span>
            <span className="font-display text-[22px] font-black leading-none tabular-nums text-foreground">{facet.latest ?? "—"}</span>
          </div>
          <div className="flex flex-col">
            <span>{facet.points.length}개월 · {DIRECTION_LABEL[facet.direction]}</span>
            <span style={{ color: DIRECTION_COLOR[facet.direction] }} className="font-mono text-[13px] font-semibold tabular-nums">
              {percent(facet.ratio)}
            </span>
          </div>
          <div className="h-8 w-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={facet.points} margin={{ top: 2, right: 1, bottom: 0, left: 1 }}>
                <YAxis hide domain={[0, "dataMax"]} />
                <Line type="monotone" dataKey="subscribers" stroke={DIRECTION_COLOR[facet.direction]} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {facet.points.length > 0 ? `${label(facet.points[0].ym)} ~ ${label(facet.points[facet.points.length - 1].ym)} · 세로축 0부터` : null}
          </span>
        </>
      ) : (
        <span>연금 스냅샷 없음 · 국민연금 가입 사업장 기준</span>
      )}
    </div>
  );
}
