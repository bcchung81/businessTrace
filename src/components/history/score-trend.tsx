"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export type TrendFacet = { companyId: number; name: string; grade: string; points: Array<{ ym: string; total: number }> };

function ymLabel(ym: string) {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/**
 * 기업마다 월 축 위의 총점 라인을 하나씩 둔다 — 확정 기간(연·반기·분기)의 끝 달이 점의 자리다.
 * 한 축에 50개 선을 겹치면 색으로만 갈라야 해서 읽을 수 없다.
 */
export function ScoreTrend({ facets }: { facets: TrendFacet[] }) {
  if (facets.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
        시상 확정이 없습니다. 랭킹 화면에서 시상 확정을 실행하세요.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {facets.map((facet) => {
        const first = facet.points[0];
        const last = facet.points.at(-1);
        return (
          <li key={facet.companyId} className="border-t-2 border-ink bg-background pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold">{facet.name}</span>
              <span className="font-mono text-[16px] font-bold tabular-nums">{last?.total.toFixed(2) ?? "—"}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
              <span>{first && last ? `${ymLabel(first.ym)} ~ ${ymLabel(last.ym)} · ${facet.points.length}회 확정` : "확정 없음"}</span>
              <span>{facet.grade}</span>
            </div>
            <div className="mt-2 h-[52px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={facet.points} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis hide domain={[0, 1]} />
                  <Tooltip
                    labelFormatter={(ym) => ymLabel(String(ym ?? ""))}
                    formatter={(value) => [Number(value).toFixed(2), "총점"] as [string, string]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
