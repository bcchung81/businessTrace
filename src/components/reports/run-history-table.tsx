import { VerdictPill } from "@/components/dashboard/verdict-pill";
import type { RunHistoryRow } from "@/lib/repositories/analysisRun";
import { formatRunTime } from "@/lib/services/formatRunTime";

/**
 * 분석 실행 이력 표 — 완료된 실행만 엑셀 링크를 낸다. 토큰은 입력+출력 합계다.
 */
export function RunHistoryTable({ rows }: { rows: RunHistoryRow[] }) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">실행 이력이 없습니다. 기업 화면의 일괄 실행이 이곳에 쌓입니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b-2 border-ink text-left">
            <th className="py-1.5 pr-2 font-semibold">실행일시</th>
            <th className="py-1.5 pr-2 font-semibold">기업</th>
            <th className="py-1.5 pr-2 text-right font-semibold">기사</th>
            <th className="py-1.5 pr-2 font-semibold">판정</th>
            <th className="py-1.5 pr-2 text-right font-semibold">토큰</th>
            <th className="py-1.5 font-semibold">리포트</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-hairline">
              <td className="whitespace-nowrap py-1.5 pr-2 font-mono tabular-nums text-muted-foreground">{formatRunTime(row.createdAt)}</td>
              <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">{row.companyName}</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{row.articleCount}</td>
              <td className="py-1.5 pr-2">{row.verdict ? <VerdictPill verdict={row.verdict === "verified" ? "verified" : row.verdict === "risk" ? "risk" : "review"} /> : <span className="text-muted-foreground">{row.status === "running" ? "실행 중" : "—"}</span>}</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{row.usage ? row.usage.inputTokens + row.usage.outputTokens : "—"}</td>
              <td className="py-1.5">
                {row.status === "completed" ? (
                  <a href={`/api/reports/${row.id}`} className="border-[1.5px] border-hairline px-2 py-0.5 text-[11.5px] font-bold hover:bg-secondary">
                    엑셀
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
