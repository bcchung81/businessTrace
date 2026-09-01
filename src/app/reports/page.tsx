import { listRunHistory } from "@/lib/repositories/analysisRun";
import { listYears } from "@/lib/repositories/companyRepository";
import { listSubmissions } from "@/lib/repositories/submission";
import { Panel } from "@/components/dashboard/panel";
import { MonthlyDocList } from "@/components/reports/monthly-doc-list";
import { RunHistoryTable } from "@/components/reports/run-history-table";
import { SubmissionBox } from "@/components/reports/submission-box";
import { KST_OFFSET_MS } from "@/lib/services/kst";

export default async function ReportsPage() {
  const cohortYear = (await listYears())[0] ?? new Date().getFullYear();
  const runs = await listRunHistory({ year: cohortYear });
  const submissions = await listSubmissions();
  const kstNow = new Date(new Date().getTime() + KST_OFFSET_MS);
  const today = { year: kstNow.getUTCFullYear(), month: kstNow.getUTCMonth() + 1 };

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{cohortYear}년 우수기업 · 리포트</span>
        <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">리포트·실행 이력</h1>
      </header>

      <Panel index="01" title="실행 이력" tag="실측" note={`${cohortYear}년 ${runs.length}건 · 20건씩 · 완료된 실행만 엑셀 링크`}>
        <RunHistoryTable rows={runs} />
      </Panel>
      <Panel index="02" title="월간 문서" tag="생성형">
        <MonthlyDocList cohortYear={cohortYear} year={today.year} month={today.month} />
      </Panel>
      <Panel index="03" title="제출 자료 보관함" tag="기록" note="파일명 · 제출일 · sha-256 앞 12자리">
        <SubmissionBox submissions={submissions} />
      </Panel>
    </div>
  );
}
