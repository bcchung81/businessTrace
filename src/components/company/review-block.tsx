"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SeverityIcon, SeverityMark } from "@/components/dashboard/severity-ui";
import { Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/companies/[id]/actions";
import type { ReviewItem, ReviewSummary } from "@/lib/repositories/reviewItems";
import { KIND_LABEL, type EventKind } from "@/lib/services/eventRules";
import { kstDate } from "@/lib/services/kst";
import { EVIDENCE_MATCH_THRESHOLD, FAITHFULNESS_THRESHOLD, SOURCE_COVERAGE_THRESHOLD } from "@/lib/services/verificationScores";

export type ReviewActions = {
  decideNps: (input: { companyId: number; prefix: string; label: string }) => Promise<ActionResult>;
  holdNps: (input: { companyId: number }) => Promise<ActionResult>;
  decideDart: (input: { companyId: number; corpCode: string; label?: string }) => Promise<ActionResult>;
  decideFsc: (input: { companyId: number; value: string; label?: string }) => Promise<ActionResult>;
  reviewVerification: (input: { runId: number; note: string }) => Promise<ActionResult>;
  confirmEvents: (input: { companyId: number; eventIds: number[]; action: "acknowledge" | "done" }) => Promise<ActionResult>;
  saveAliases: (input: { companyId: number; aliases: string[] }) => Promise<ActionResult>;
  saveBusinessNo: (input: { companyId: number; businessNo: string }) => Promise<ActionResult>;
};

type Runner = (work: () => Promise<ActionResult>, after?: () => void) => void;

function Item({ icon, title, badge, why, children, actions }: { icon: "alert" | "notice" | "info"; title: string; badge?: string; why: string; children: React.ReactNode; actions: React.ReactNode }) {
  const tone = icon === "alert" ? "text-risk" : icon === "notice" ? "text-review" : "text-muted-foreground";
  return (
    <div className="grid gap-4 border-b border-hairline py-3.5 last:border-0 md:grid-cols-[200px_minmax(0,1fr)_180px]">
      <div className="flex flex-col gap-1">
        <span className={`flex items-center gap-1.5 text-[13px] font-extrabold ${tone}`}>
          <SeverityIcon severity={icon} />
          {title}
          {badge ? <span className="bg-ink px-1.5 py-[1px] text-[10.5px] font-bold text-background">{badge}</span> : null}
        </span>
        <span className="text-[11.5px] text-muted-foreground">{why}</span>
      </div>
      <div className="min-w-0">{children}</div>
      <div className="flex flex-col items-start gap-1.5 md:items-end">{actions}</div>
    </div>
  );
}

function NpsConflict({ item, companyId, run, actions }: { item: Extract<ReviewItem, { kind: "nps_conflict" }>; companyId: number; run: Runner; actions: ReviewActions }) {
  const [prefix, setPrefix] = useState<string | null>(item.candidates.find((c) => c.registryMatch)?.prefix ?? null);
  const chosen = item.candidates.find((c) => c.prefix === prefix);
  return (
    <Item icon="alert" title="동명 타사 충돌" badge="국민연금" why={`상호가 겹치는 사업장 ${item.candidates.length}건 · 고르기 전까지 고용 규모가 비어 있다`}
      actions={<>
        <Button variant="signal" size="sm" disabled={!chosen} onClick={() => chosen && run(() => actions.decideNps({ companyId, prefix: chosen.prefix, label: `${chosen.name} · ${chosen.address ?? "주소 없음"}` }))}>이 사업장으로 확정</Button>
        <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.holdNps({ companyId }))}>보류</Button>
        <span className="text-[11px] text-muted-foreground">확정하면 원천 재조회 1회</span>
      </>}
    >
      <div role="radiogroup" aria-label="국민연금 후보" className="flex flex-col gap-1.5">
        {item.candidates.map((candidate) => (
          <label key={candidate.prefix} className={`grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 border-[1.5px] px-2.5 py-2 text-[12px] ${prefix === candidate.prefix ? "border-primary bg-accent" : "border-hairline"}`}>
            <input type="radio" name="nps" aria-label={candidate.name} checked={prefix === candidate.prefix} onChange={() => setPrefix(candidate.prefix)} />
            <span><b>{candidate.name}</b> <span className="text-[11px] text-muted-foreground">{candidate.address ?? "주소 없음"} · {candidate.prefix}-****</span></span>
            {candidate.registryMatch ? <span className="whitespace-nowrap border-[1.5px] border-verified px-1.5 text-[10.5px] font-bold text-verified">등록 번호 일치</span> : <span className="whitespace-nowrap border-[1.5px] border-hairline px-1.5 text-[10.5px] font-bold text-muted-foreground">일치 원천 없음</span>}
          </label>
        ))}
      </div>
    </Item>
  );
}

function FscConflict({ item, companyId, run, actions }: { item: Extract<ReviewItem, { kind: "fsc_conflict" }>; companyId: number; run: Runner; actions: ReviewActions }) {
  return (
    <Item icon="notice" title="사업자번호 불일치" badge="금융위" why="상호 검색이 잡은 금융위 레코드의 번호가 확보한 번호와 다르다"
      actions={
        <>
          <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.decideFsc({ companyId, value: item.fscNo, label: item.corpName }))}>이 기업이 맞다</Button>
          <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.decideFsc({ companyId, value: "none" }))}>동명 타사다 — 금융위 미등재로 확정</Button>
        </>
      }
    >
      <div className="flex flex-col gap-1 text-[12.5px]">
        <span className="font-semibold">{item.corpName}</span>
        <span className="font-mono tabular-nums text-muted-foreground">확보 {item.registryNo ?? "없음"} ↔ 금융위 {item.fscNo}</span>
      </div>
    </Item>
  );
}

function DartConflict({ item, companyId, run, actions }: { item: Extract<ReviewItem, { kind: "dart_conflict" }>; companyId: number; run: Runner; actions: ReviewActions }) {
  return (
    <Item icon="alert" title="동명 타사 충돌" badge="DART" why={`이름이 정확히 맞는 기업이 없다 · 후보 ${item.candidateCount}건`}
      actions={<>
        <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.decideDart({ companyId, corpCode: item.candidate.corpCode, label: item.candidate.corpName }))}>이 기업이 맞다</Button>
        <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.decideDart({ companyId, corpCode: "none" }))}>아니다 — DART 미등록으로 확정</Button>
      </>}
    >
      <div className="border-[1.5px] border-hairline px-2.5 py-2 text-[12px]">
        <b>{item.candidate.corpName}</b> <span className="text-[11px] text-muted-foreground">고유번호 {item.candidate.corpCode}{item.candidate.stockCode ? ` · 상장 ${item.candidate.stockCode}` : " · 비상장"}</span>
      </div>
    </Item>
  );
}

function Verification({ item, run, actions }: { item: Extract<ReviewItem, { kind: "verification" }>; run: Runner; actions: ReviewActions }) {
  const [note, setNote] = useState(item.note ?? "");
  const gate = (label: string, value: number | null, threshold: number, failed: boolean) => (
    <span className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <b className={`font-mono tabular-nums ${failed ? "text-review" : ""}`}>{value === null ? "—" : value.toFixed(2)} · ≥{threshold}</b>
    </span>
  );
  return (
    <Item icon="notice" title="검증 검토 필요" why={`탈락 사유: ${item.failed.join(" · ") || "없음"} · 검증 근거 패널에서 문장별 지지 여부를 볼 수 있다`}
      actions={<>
        <Button variant="signal" size="sm" onClick={() => run(() => actions.reviewVerification({ runId: item.runId, note }))}>검토 완료로 기록</Button>
        <a href="#verification" className="text-[11.5px] underline decoration-dotted underline-offset-2">검증 근거 열기</a>
      </>}
    >
      <div className="flex flex-col gap-2 text-[11.5px]">
        <div className="flex flex-wrap gap-4">
          {gate("출처 인용", item.sourceCoverage, SOURCE_COVERAGE_THRESHOLD, item.failed.includes("출처 인용"))}
          {gate("근거 충실도", item.faithfulness, FAITHFULNESS_THRESHOLD, item.failed.includes("근거 충실도"))}
          {gate("근거 일치", item.evidenceMatch, EVIDENCE_MATCH_THRESHOLD, item.failed.includes("근거 일치"))}
          <span className="flex flex-col"><span className="text-muted-foreground">반증</span><b>{item.counterEvidence.length === 0 ? "없음" : `${item.counterEvidence.length}건 · ${item.counterEvidence[0]}`}</b></span>
        </div>
        <textarea aria-label="검토 메모" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="검토 메모 — 예: 불지지 주장은 기사 원문에 없음, 종합의견에서 제외 판단" className="w-full border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[12px] focus-visible:border-ink focus-visible:outline-none" />
      </div>
    </Item>
  );
}

function OpenEvents({ item, companyId, run, actions }: { item: Extract<ReviewItem, { kind: "open_events" }>; companyId: number; run: Runner; actions: ReviewActions }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return (
    <Item icon="notice" title="미확인 사건" badge={`경보·주의 ${item.events.length}`} why="확인한 경보만 랭킹에서 감점한다 · 긍정·정보 사건은 여기 두지 않는다"
      actions={<>
        <Button variant="signal" size="sm" disabled={picked.size === 0} onClick={() => run(() => actions.confirmEvents({ companyId, eventIds: [...picked], action: "acknowledge" }), () => setPicked(new Set()))}>선택 {picked.size}건 확인</Button>
        <Button variant="signal-outline" size="sm" onClick={() => run(() => actions.confirmEvents({ companyId, eventIds: item.events.map((e) => e.id), action: "acknowledge" }))}>모두 확인</Button>
      </>}
    >
      <ul className="flex flex-col">
        {item.events.map((event) => (
          <li key={event.id} className="grid grid-cols-[20px_56px_90px_minmax(0,1fr)] items-center gap-2.5 border-b border-hairline py-1.5 text-[12px] last:border-0">
            <input type="checkbox" aria-label={event.title} checked={picked.has(event.id)} onChange={() => toggle(event.id)} />
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{kstDate(event.occurredAt).slice(5)}</span>
            <SeverityMark severity={event.severity} />
            <span>
              {KIND_LABEL[event.kind as EventKind] ?? event.kind} — {event.title}
              {event.evidence.map((ev, index) => ev.link ? <a key={index} href={ev.link} target="_blank" rel="noreferrer" className="ml-2 underline decoration-dotted underline-offset-2">{ev.label}</a> : <span key={index} className="ml-2 text-muted-foreground">{ev.label}</span>)}
            </span>
          </li>
        ))}
      </ul>
    </Item>
  );
}

function NoNews({ item, companyId, year, run, actions }: { item: Extract<ReviewItem, { kind: "no_news" }>; companyId: number; year: number; run: Runner; actions: ReviewActions }) {
  const router = useRouter();
  const [aliases, setAliases] = useState<string[]>(item.aliases);
  const [draft, setDraft] = useState("");
  const add = () => { const value = draft.trim(); if (value && !aliases.includes(value)) setAliases([...aliases, value]); setDraft(""); };
  return (
    <Item icon="info" title="기사 0건" why="회사명만으로 검색된다 · 일반명사·약칭이면 별칭을 더한다"
      actions={<Button variant="signal" size="sm" onClick={() => run(() => actions.saveAliases({ companyId, aliases }), () => router.push(`/companies?year=${year}&run=${companyId}&stage=news#batch`))}>저장 후 수집만 재실행</Button>}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((alias) => (
            <span key={alias} className="inline-flex items-center gap-1.5 border-[1.5px] border-ink px-2 py-0.5 text-[11.5px] font-semibold">
              {alias}
              <button type="button" aria-label={`${alias} 삭제`} onClick={() => setAliases(aliases.filter((a) => a !== alias))} className="text-muted-foreground">×</button>
            </span>
          ))}
        </div>
        <input aria-label="검색 별칭" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="별칭 입력 후 Enter" className="max-w-xs border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[12px] focus-visible:border-ink focus-visible:outline-none" />
      </div>
    </Item>
  );
}

function NoBusinessNo({ item, companyId, run, actions }: { item: Extract<ReviewItem, { kind: "no_business_no" }>; companyId: number; run: Runner; actions: ReviewActions }) {
  const [value, setValue] = useState(item.npsPrefix ?? "");
  const complete = value.replace(/\D/g, "").length === 10;
  return (
    <Item icon="alert" title="사업자번호 미확보" why="국세청·나라장터·금융위가 닫혀 있다 · 뉴스와 국민연금만으로 판단 중"
      actions={<Button variant="signal" size="sm" onClick={() => run(() => actions.saveBusinessNo({ companyId, businessNo: value }))}>저장 후 원천 대조</Button>}
    >
      <div className="flex flex-col gap-1.5">
        <input aria-label="사업자번호" value={value} onChange={(e) => setValue(e.target.value)} placeholder="000-00-00000" className="max-w-[220px] border-[1.5px] border-hairline bg-background px-2.5 py-1.5 font-mono text-[12px] tabular-nums focus-visible:border-ink focus-visible:outline-none" />
        <span className="text-[11.5px] text-muted-foreground">
          {item.npsPrefix ? `국민연금이 확인한 앞 6자리 ${item.npsPrefix} · ` : ""}
          {complete ? "입력 즉시 미리보기: 국세청·나라장터·금융위 조회 가능 · DART 는 상호로 재조회" : "10자리를 입력하면 국세청·나라장터·금융위가 열린다"}
        </span>
      </div>
    </Item>
  );
}

/**
 * 헤더 바로 아래 절 00 — 사람이 정해야 다음 단계가 열리는 것만 모은다. 정리되면 한 줄로 준다(§2-K).
 */
export function ReviewBlock({ companyId, year, summary, actions }: { companyId: number; year: number; summary: ReviewSummary; actions: ReviewActions }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run: Runner = (work, after) => {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) { setError(result.message); return; }
      after?.();
      setSaved("저장했습니다 · 화면을 다시 읽는 중");
      router.refresh();
    });
  };
  const count = summary.items.length;
  const tally = (kind: ReviewItem["kind"]) => summary.items.filter((i) => i.kind === kind).length;
  const openCount = summary.items.reduce((acc, i) => acc + (i.kind === "open_events" ? i.events.length : 0), 0);
  const note = count === 0
    ? `동명 충돌 0 · 검토 필요 0 · 미확인 경보·주의 0 · 기사 있음 · ${summary.lastDecidedAt ? `마지막 정리 ${kstDate(summary.lastDecidedAt)}` : "정리 기록 없음"}`
    : `동명 충돌 ${tally("nps_conflict") + tally("dart_conflict") + tally("fsc_conflict")} · 검토 필요 ${tally("verification")} · 미확인 경보·주의 ${openCount} · 사람이 정해야 다음 단계가 열리는 것만 모았다`;

  return (
    <Panel index="00" title="확인 필요" tag={count === 0 ? "없음" : `${count}건`} tone={count === 0 ? "plain" : "review"} note={note}>
      {count === 0 ? null : (
        <fieldset disabled={pending} className="flex flex-col border-0 p-0">
          {error ? <p role="alert" className="border-l-2 border-risk bg-risk-surface px-3 py-2 text-[12px] font-medium text-risk">{error}</p> : null}
          {saved ? <p role="status" className="border-l-2 border-primary bg-accent px-3 py-2 text-[12px] font-medium text-accent-foreground">{saved}</p> : null}
          {summary.items.map((item, index) => {
            switch (item.kind) {
              case "no_business_no": return <NoBusinessNo key={index} item={item} companyId={companyId} run={run} actions={actions} />;
              case "nps_conflict": return <NpsConflict key={index} item={item} companyId={companyId} run={run} actions={actions} />;
              case "dart_conflict": return <DartConflict key={index} item={item} companyId={companyId} run={run} actions={actions} />;
              case "fsc_conflict": return <FscConflict key={index} item={item} companyId={companyId} run={run} actions={actions} />;
              case "verification": return <Verification key={index} item={item} run={run} actions={actions} />;
              case "open_events": return <OpenEvents key={index} item={item} companyId={companyId} run={run} actions={actions} />;
              case "no_news": return <NoNews key={index} item={item} companyId={companyId} year={year} run={run} actions={actions} />;
            }
          })}
        </fieldset>
      )}
    </Panel>
  );
}
