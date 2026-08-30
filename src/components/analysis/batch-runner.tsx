"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_BATCH, reduceBatch, STATUS_TEXT, STEP_LABEL, STEP_ORDER, stepOf, type BatchState, type StepKey } from "@/lib/services/batchProgress";
import type { BatchStage } from "@/lib/services/batchRegistry";
import { createSseParser } from "@/lib/services/sse";

export type BatchCandidate = { id: number; name: string; verified: boolean; hasWarning: boolean; businessNo: string | null };

const STAGE_LABEL: Record<BatchStage, string> = { full: "전체(수집·분석·검증)", news: "수집만", sources: "원천 대조만" };
const LIMITS = [10, 20, 50, 100];

/**
 * 여러 기업을 골라 한 번에 돌리고 4단 스테퍼·기업별 진행·로그를 실시간으로 보인다.
 * 실행 중에는 primary 버튼이 "중단" 하나뿐이다. 화면을 떠나면 스트림을 끊어 서버도 멈추게 한다.
 */
export function BatchRunner({
  candidates,
  preselected = [],
  initialStage = "full",
  fetchImpl = fetch,
}: {
  candidates: BatchCandidate[];
  preselected?: number[];
  initialStage?: BatchStage;
  fetchImpl?: typeof fetch;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(preselected));
  const [stage, setStage] = useState<BatchStage>(initialStage);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [limit, setLimit] = useState(20);
  const [force, setForce] = useState(false);
  const [naver, setNaver] = useState(true);
  const [google, setGoogle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<BatchState>(INITIAL_BATCH);
  const running = useRef<AbortController | null>(null);
  const router = useRouter();

  useEffect(() => () => running.current?.abort(), []);

  const pick = (predicate: (candidate: BatchCandidate) => boolean) => setSelected(new Set(candidates.filter(predicate).map((c) => c.id)));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function run() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setBusy(true);
    setError(null);
    setState(INITIAL_BATCH);
    try {
      const response = await fetchImpl("/api/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          companyIds: [...selected],
          stage,
          limit,
          force,
          naver,
          google,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `실행 요청 실패 (${response.status})`);
        return;
      }
      const parser = createSseParser();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let current = INITIAL_BATCH;
      for (;;) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;
        for (const event of parser.push(value)) current = reduceBatch(current, event);
        setState(current);
      }
      if (current.phase === "done") router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
    } finally {
      if (running.current === controller) running.current = null;
      setBusy(false);
    }
  }

  function abort() {
    running.current?.abort();
    running.current = null;
    setBusy(false);
  }

  const countAt = (key: StepKey) => state.companies.filter((c) => stepOf(c) === key).length;
  const activeStep = STEP_ORDER.filter((key) => state.companies.some((c) => c.status === null && stepOf(c) === key)).at(-1) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={busy} className="flex flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span className="font-bold">대상</span>
            <Button type="button" variant="signal-outline" size="sm" onClick={() => pick((c) => !c.verified)}>미분석만</Button>
            <Button type="button" variant="signal-outline" size="sm" onClick={() => pick((c) => c.hasWarning)}>주의·경보 있는 기업만</Button>
            <Button type="button" variant="signal-outline" size="sm" onClick={() => setSelected((prev) => new Set([...prev].filter((id) => candidates.find((c) => c.id === id)?.businessNo)))}>
              사업자번호 미확보 제외
            </Button>
            <Button type="button" variant="signal-outline" size="sm" onClick={() => pick(() => true)}>전체</Button>
            <Button type="button" variant="signal-outline" size="sm" onClick={() => setSelected(new Set())}>해제</Button>
            <span className="ml-auto font-mono tabular-nums text-muted-foreground">{selected.size}개사 선택</span>
          </div>
          <ul className="grid max-h-48 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto border border-hairline p-2 text-[12px] sm:grid-cols-3 lg:grid-cols-4">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" aria-label={candidate.name} checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                  <span className="truncate">{candidate.name}</span>
                  {candidate.businessNo ? null : <span className="text-[10.5px] font-semibold text-review">미확보</span>}
                  {candidate.verified ? <span className="text-[10.5px] text-muted-foreground">검증됨</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 border-t border-hairline pt-4 text-[12px] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div role="radiogroup" aria-label="단계" className="flex flex-col gap-1.5">
            <span className="font-bold">단계</span>
            {(Object.keys(STAGE_LABEL) as BatchStage[]).map((key) => (
              <label key={key} className="flex items-center gap-1.5">
                <input type="radio" name="stage" value={key} checked={stage === key} onChange={() => setStage(key)} />
                {STAGE_LABEL[key]}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="font-bold">시작일</span>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 text-[12px]" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-bold">종료일</span>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 text-[12px]" />
              </label>
            </div>
            <label className="flex items-center gap-2">
              <span className="font-bold">기사 상한</span>
              <select aria-label="기사 상한" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="border-[1.5px] border-hairline bg-background px-2 py-0.5">
                {LIMITS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" aria-label="재실행 허용" checked={force} onChange={(e) => setForce(e.target.checked)} />
              재실행 허용
              <span className="text-muted-foreground">— 이미 검증된 기업도 다시</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="font-bold">수집원</span>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={naver} onChange={(e) => setNaver(e.target.checked)} />네이버</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={google} onChange={(e) => setGoogle(e.target.checked)} />구글 RSS</label>
            </div>
          </div>
        </div>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-hairline pt-4">
        {busy ? (
          <Button type="button" variant="signal" onClick={abort}>중단</Button>
        ) : (
          <Button type="button" variant="signal" disabled={selected.size === 0} onClick={run}>실행</Button>
        )}
        {error ? <p role="alert" className="text-[12px] font-medium text-risk">{error}</p> : null}
        {state.phase === "done" ? (
          <p className="text-[12px] text-muted-foreground">
            완료 <b className="font-mono text-foreground">{state.done}/{state.total}</b>
            {state.aborted ? <span className="ml-2 font-semibold text-review">중단됨</span> : null}
          </p>
        ) : null}
      </div>

      {state.phase !== "idle" ? (
        <div className="flex flex-col gap-4">
          <ol aria-label="파이프라인 단계" className="grid grid-cols-4 gap-2">
            {STEP_ORDER.map((key) => {
              const count = countAt(key);
              const tone = key === activeStep ? "border-primary" : count > 0 ? "border-ink" : "border-hairline";
              return (
                <li key={key} className={`border-t-4 pt-2 ${tone}`}>
                  <span className="font-display text-[14px] font-black">{STEP_LABEL[key]}</span>
                  <span className="ml-2 font-mono text-[11px] tabular-nums text-muted-foreground">{count}개사</span>
                </li>
              );
            })}
          </ol>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <caption className="sr-only">기업별 진행</caption>
              <thead>
                <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em]">
                  <th scope="col" className="px-2 py-1.5 text-left">기업</th>
                  <th scope="col" className="px-2 py-1.5 text-left">단계</th>
                  <th scope="col" className="px-2 py-1.5 text-right">진행</th>
                  <th scope="col" className="px-2 py-1.5 text-left">상태</th>
                  <th scope="col" className="px-2 py-1.5 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {state.companies.map((c) => {
                  const step = stepOf(c);
                  return (
                    <tr key={c.companyId} className="border-b border-hairline last:border-0">
                      <td className="px-2 py-1.5 font-semibold">{c.name}</td>
                      <td className="px-2 py-1.5">{step ? STEP_LABEL[step] : "대기"}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{c.run.total > 0 ? `${c.run.current}/${c.run.total}` : "—"}</td>
                      <td className="px-2 py-1.5">{c.status ? STATUS_TEXT[c.status] : "진행 중"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.message ?? (c.articles !== null ? `기사 ${c.articles}건` : "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {state.log.length > 0 ? (
            <ul role="log" className="flex max-h-56 flex-col gap-0.5 overflow-y-auto border-l-2 border-ink bg-surface p-3 font-mono text-[11.5px]">
              {state.log.map((entry, index) => (
                <li key={`${index}-${entry.text}`} className={entry.level === "error" ? "text-risk" : entry.level === "warn" ? "text-review" : ""}>
                  {entry.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
