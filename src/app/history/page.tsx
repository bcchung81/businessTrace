import { listEvents } from "@/lib/repositories/eventRepository";
import { listSelections, listSelectionYears } from "@/lib/repositories/selectionRecord";
import { computeAwards } from "@/lib/services/awards";
import { pivotEvents } from "@/lib/services/eventPivot";
import { periodEndYm, periodLabel } from "@/lib/services/periods";
import { Panel } from "@/components/dashboard/panel";
import { AwardBoard } from "@/components/history/award-board";
import { EventPivotTable } from "@/components/history/event-pivot-table";
import { ScoreHeatmap } from "@/components/history/score-heatmap";
import { buildScoreHeatmap } from "@/lib/services/scoreHeatmap";
import { listBenchmarkInputs } from "@/lib/repositories/benchmarkInputs";
import { loadRubrics, rankCompanies } from "@/lib/services/benchmarking";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const years = await listSelectionYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());

  const records = await listSelections();
  const awardRecords = records.map((record) => ({ companyId: record.companyId, companyName: record.companyName, period: record.period, total: record.total, rank: record.rank }));

  const yearPeriods = [...new Set(records.filter((record) => record.year === year).map((record) => record.period))].sort(
    (a, b) => periodEndYm(b).localeCompare(periodEndYm(a)) || b.localeCompare(a),
  );
  const requestedPeriod = typeof params.period === "string" ? params.period : null;
  const targetPeriod = requestedPeriod && yearPeriods.includes(requestedPeriod) ? requestedPeriod : (yearPeriods[0] ?? String(year));

  const liveRanked = rankCompanies(await listBenchmarkInputs(year), loadRubrics())
    .filter((row) => row.total !== null)
    .map((row) => ({ companyId: row.companyId, companyName: row.name, rank: row.rank, total: row.total as number }));
  const heat = buildScoreHeatmap(records, liveRanked);

  const events = await listEvents({ year, since: new Date(Date.UTC(year, 0, 1)) });
  const pivot = pivotEvents(events, year);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 · 확정 기록 기준</span>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">이력·시상</h1>
          <p className="text-[12.5px] text-muted-foreground">
            랭킹 화면의 시상 확정이 남긴 기간(연·반기·분기) 기록으로 그린다 — 산식이 바뀌어도 과거 기록은 그대로다.
          </p>
        </div>
        {years.length > 0 ? (
          <nav aria-label="연도" className="flex">
            {years.map((entry) => (
              <a
                key={entry}
                href={`/history?year=${entry}`}
                aria-current={entry === year ? "page" : undefined}
                className="-ml-px border-[1.5px] border-hairline px-3 py-1 text-[12px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background"
              >
                {entry}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      <Panel
        index="01"
        title="시상 카테고리"
        tag="자동 산출"
        note="선택한 기간과 그 직전 기간들의 확정 기록이 근거다"
        aside={
          yearPeriods.length > 1 ? (
            <nav aria-label="기간" className="flex">
              {yearPeriods.map((entry) => (
                <a
                  key={entry}
                  href={`/history?year=${year}&period=${entry}`}
                  aria-current={entry === targetPeriod ? "page" : undefined}
                  className="-ml-px border-[1.5px] border-hairline px-2.5 py-0.5 text-[11.5px] font-bold text-muted-foreground first:ml-0 hover:bg-secondary aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-background"
                >
                  {periodLabel(entry)}
                </a>
              ))}
            </nav>
          ) : null
        }
      >
        <AwardBoard categories={computeAwards(awardRecords, targetPeriod)} />
      </Panel>
      <Panel index="02" title="점수 추이" tag="확정 기록" note="총점을 한 색조 진하기로 · 셀을 누르면 확정 상세 · 마지막 열은 실시간">
        <ScoreHeatmap periods={heat.periods} rows={heat.rows} />
      </Panel>
      <Panel index="03" title="사건 연간 피벗" tag="실측" note="기업×월 사건 수 · 종류는 요약 열과 셀 title 로">
        <EventPivotTable months={pivot.months} rows={pivot.rows} />
      </Panel>
    </div>
  );
}
