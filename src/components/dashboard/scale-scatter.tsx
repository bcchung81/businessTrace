"use client";

import {
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { ScatterPoint } from "@/lib/services/dashboardSummary";

const won = new Intl.NumberFormat("ko-KR");

function eok(amount: number) {
  return `${(amount / 100_000_000).toFixed(1)}억`;
}

/**
 * 로그 눈금용 도메인과 눈금을 10의 거듭제곱으로 잡는다.
 * 표본이 4명에서 3,000명까지 벌어져 선형 축에서는 대다수가 왼쪽 끝에 뭉친다.
 */
export function logAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  if (usable.length === 0) return { domain: [1, 10], ticks: [1, 10] };

  const low = Math.floor(Math.log10(Math.min(...usable)));
  const high = Math.max(low + 1, Math.ceil(Math.log10(Math.max(...usable))));
  const ticks: number[] = [];
  for (let power = low; power <= high; power += 1) ticks.push(10 ** power);

  return { domain: [10 ** low, 10 ** high], ticks };
}

/**
 * 규모(가입자)와 단가(1인 기준소득월액)를 한 화면에 놓는다.
 * 재무제표가 없는 기업군에서 유일하게 얻을 수 있는 금액 축이다. 상·하한이 있어 하한 추정치로 읽는다.
 */
export function ScaleScatter({ points }: { points: ScatterPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
        고지금액이 확보된 기업이 없습니다.
      </p>
    );
  }

  const axis = logAxis(points.map((point) => point.subscribers));

  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">
        가로축은 <b>로그 눈금</b>이다 — 4명과 3,000명이 같은 화면에 있어 선형 축에서는 대다수가 왼쪽 끝에 뭉친다.
        칸 하나가 10배다.
      </p>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="var(--hairline)" />
            <XAxis
              type="number"
              dataKey="subscribers"
              name="가입자"
              unit="명"
              scale="log"
              domain={axis.domain}
              ticks={axis.ticks}
              allowDataOverflow={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              label={{ value: "가입자수 (로그)", position: "insideBottom", offset: -16, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="averageBaseIncome"
              name="1인 기준소득월액"
              tickFormatter={(value: number) => `${Math.round(value / 10000)}만`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={48}
            />
            <ZAxis type="number" dataKey="annualPayroll" range={[80, 520]} name="추정 연 인건비" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
              formatter={(value, name) =>
                (name === "가입자"
                  ? [`${value}명`, String(name)]
                  : [`${won.format(Number(value))}원`, String(name)]) as [string, string]
              }
              labelFormatter={() => ""}
            />
            <Scatter
              data={points}
              name="기업"
              fill="var(--chart-up)"
              fillOpacity={0.42}
              stroke="var(--chart-up)"
              isAnimationActive={false}
            >
              <LabelList
                dataKey="name"
                position="top"
                style={{ fontSize: 11, fontWeight: 600, fill: "var(--foreground)" }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-2 w-full text-[12px]">
        <caption className="sr-only">기업별 규모와 1인 기준소득월액</caption>
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="py-1 text-left font-medium">기업</th>
            <th className="py-1 text-right font-medium">가입자</th>
            <th className="py-1 text-right font-medium">1인 기준소득월액</th>
            <th className="py-1 text-right font-medium">추정 연 인건비</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.companyId} className="border-t border-hairline">
              <td className="py-1">{point.name}</td>
              <td className="py-1 text-right font-mono tabular-nums">{point.subscribers}명</td>
              <td className="py-1 text-right font-mono tabular-nums">
                {won.format(point.averageBaseIncome)}원
              </td>
              <td className="py-1 text-right font-mono tabular-nums">{eok(point.annualPayroll)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
