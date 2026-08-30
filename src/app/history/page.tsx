import { listEvents } from "@/lib/repositories/eventRepository";
import { listSelections, listSelectionYears } from "@/lib/repositories/selectionRecord";
import { computeAwards } from "@/lib/services/awards";
import { pivotEvents } from "@/lib/services/eventPivot";
import { Panel } from "@/components/dashboard/panel";
import { AwardBoard } from "@/components/history/award-board";
import { EventPivotTable } from "@/components/history/event-pivot-table";
import { ScoreTrend, type TrendFacet } from "@/components/history/score-trend";

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const years = await listSelectionYears();
  const requested = Number(params.year);
  const year = Number.isInteger(requested) ? requested : (years[0] ?? new Date().getFullYear());

  const records = await listSelections();
  const facets = new Map<number, TrendFacet>();
  for (const record of records) {
    const facet = facets.get(record.companyId) ?? { companyId: record.companyId, name: record.companyName, grade: record.grade, points: [] };
    facet.points.push({ year: record.year, total: record.total });
    facet.grade = record.grade;
    facets.set(record.companyId, facet);
  }

  const events = await listEvents({ year, since: new Date(Date.UTC(year, 0, 1)) });
  const pivot = pivotEvents(events, year);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{year}년 · 확정 기록 기준</span>
          <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">이력·시상</h1>
          <p className="text-[12.5px] text-muted-foreground">
            랭킹 화면의 시상 확정이 남긴 연도 기록으로 그린다 — 산식이 바뀌어도 과거 기록은 그대로다.
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

      <Panel index="01" title="시상 카테고리" tag="자동 산출" note="확정된 연도 기록만 근거다">
        <AwardBoard categories={computeAwards(records, year)} />
      </Panel>
      <Panel index="02" title="점수 추이" tag="확정 기록" note="연도별 총점 0~1 · 산식 버전은 기록마다 저장">
        <ScoreTrend facets={[...facets.values()]} />
      </Panel>
      <Panel index="03" title="사건 연간 피벗" tag="실측" note="기업×월 사건 수 · 종류는 셀에 마우스를 올리면">
        <EventPivotTable months={pivot.months} rows={pivot.rows} />
      </Panel>
    </div>
  );
}
