import { Panel } from "@/components/dashboard/panel";
import { JudgmentWorkbench } from "@/components/judgments/judgment-workbench";
import { listJudgments, listReflectPending } from "@/lib/repositories/articleJudgment";
import { toJudgmentView } from "@/lib/services/judgments";
import { saveJudgmentAction } from "@/app/(app)/judgments/actions";

export default async function JudgmentsPage() {
  const [rows, reflect] = await Promise.all([listJudgments(), listReflectPending()]);
  const items = rows.map(toJudgmentView);
  const pending = items.filter((item) => !item.judged).length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">사람 판정 · 다음 분석에 반영</span>
        <h1 className="font-display text-[36px] font-black leading-none tracking-[-0.04em]">기사 판정</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          분석기가 보류한 기사와 사람이 올린 기사가 이 회사의 이야기인지 가립니다. &quot;주제 아님&quot;은 그 기업의 다음 분석에서 빠지고, &quot;주제&quot;는 다시 수집되면 주제로 셉니다.
          분석기의 답은 판정을 저장한 뒤에 보입니다.
        </p>
      </header>
      <Panel index="01" title="판정 대기열" tag="사람" note={`미판정 ${pending}건 · 전체 ${items.length}건`}>
        <JudgmentWorkbench items={items} reflect={reflect} save={saveJudgmentAction} />
      </Panel>
    </div>
  );
}
