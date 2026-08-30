"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { INITIAL_RUN, reduceAnalysis, type RunState } from "@/lib/services/analysisProgress";
import { createSseParser } from "@/lib/services/sse";
import type { AnalyzeStep } from "@/lib/services/analyzer";

const STEP_LABEL: Record<AnalyzeStep, string> = {
  trend: "동향분석",
  award: "수상분석",
  investment: "투자분석",
  opinion: "종합의견",
};

const PHASE_LABEL: Record<RunState["phase"], string> = {
  idle: "대기",
  analyzing: "분석 중",
  verifying: "검증 중",
  done: "완료",
  failed: "실패",
};

type Company = { id: number; name: string };

function verdict(state: RunState) {
  if (state.phase !== "done") return null;
  return state.verification?.status === "verified" ? "검증 완료" : "검토 필요";
}

/**
 * 수집 → 분석 → 검증을 한 화면에서 돌리고 진행을 실시간으로 보여준다.
 * 기사 결과는 도착하는 대로 붙인다 - 끝날 때까지 기다리면 무엇이 오래 걸리는지 알 수 없다.
 * 화면을 떠나면 스트림을 끊는다 - 놔두면 열린 연결과 리더가 남고 서버는 아무도 안 보는 분석을 계속 돌린다.
 */
export function AnalysisRunner({
  companies,
  fetchImpl = fetch,
}: {
  companies: Company[];
  fetchImpl?: typeof fetch;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? 0);
  const [limit, setLimit] = useState(30);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<RunState>(INITIAL_RUN);
  const running = useRef<AbortController | null>(null);
  const router = useRouter();

  useEffect(() => () => running.current?.abort(), []);

  if (companies.length === 0) {
    return (
      <p className="border border-dashed border-hairline p-6 text-center text-[13px] text-muted-foreground">
        등록된 기업이 없습니다. 기업 등록에서 먼저 명단을 올리세요.
      </p>
    );
  }

  async function run() {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;

    setBusy(true);
    setError(null);
    setState(INITIAL_RUN);

    try {
      const response = await fetchImpl("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          companyId,
          limit,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        }),
      });

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `분석 요청 실패 (${response.status})`);
        return;
      }

      const parser = createSseParser();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let current = INITIAL_RUN;

      for (;;) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;
        for (const event of parser.push(value)) {
          current = reduceAnalysis(current, event);
        }
        setState(current);
      }

      if (current.phase === "done") router.refresh();
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "알 수 없는 오류");
    } finally {
      if (running.current === controller) running.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const ratio = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
  const status = verdict(state);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 border-[1.5px] border-ink bg-background p-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] font-medium">
          기업
          <select
            aria-label="기업"
            value={companyId}
            onChange={(event) => setCompanyId(Number(event.target.value))}
            className="border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[13px] font-normal focus-visible:border-ink focus-visible:outline-none"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">
          시작일
          <input
            aria-label="시작일"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[13px] font-normal focus-visible:border-ink focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">
          종료일
          <input
            aria-label="종료일"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[13px] font-normal focus-visible:border-ink focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-medium">
          기사 상한
          <input
            aria-label="기사 상한"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[13px] font-normal focus-visible:border-ink focus-visible:outline-none tabular-nums"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy}>
          {busy ? "실행 중…" : "분석 실행"}
        </Button>
        <span className="text-[12px] text-muted-foreground">
          {PHASE_LABEL[state.phase]}
          {state.step ? ` · ${STEP_LABEL[state.step]}` : null}
        </span>
        {status ? (
          <span
            className={`px-2 py-0.5 text-[12px] font-bold ${
              status === "검증 완료"
                ? "bg-verified-surface text-verified"
                : "bg-review-surface text-review"
            }`}
          >
            {status}
          </span>
        ) : null}
        {error ? (
          <p role="alert" className="text-[12px] font-medium text-risk">
            {error}
          </p>
        ) : null}
      </div>

      {state.step ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px]">
            <span className="font-semibold">{STEP_LABEL[state.step]}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {state.current} / {state.total}
            </span>
          </div>
          <div className="h-2 overflow-hidden border border-hairline bg-surface">
            <div className="h-full bg-primary" style={{ width: `${ratio}%` }} />
          </div>
        </div>
      ) : null}

      {state.log.length > 0 ? (
        <ul className="flex flex-col gap-0.5 border-l-2 border-ink bg-surface p-3 font-mono text-[11.5px]">
          {state.log.map((entry, index) => (
            <li
              key={`${index}-${entry.text}`}
              className={
                entry.level === "error"
                  ? "text-risk"
                  : entry.level === "warn"
                    ? "text-review"
                    : "text-muted-foreground"
              }
            >
              {entry.text}
            </li>
          ))}
        </ul>
      ) : null}

      {state.analyses.length > 0 ? (
        <div className="overflow-x-auto border-t-2 border-ink bg-background">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">기사별 분석 결과</caption>
            <thead>
              <tr className="border-b border-hairline text-[11px] text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">기사</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">언론사</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">감성</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">수상</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">투자</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">집계</th>
              </tr>
            </thead>
            <tbody>
              {state.analyses.map((analysis, index) => {
                const score = analysis.trend.sentiment_score;
                return (
                  <tr key={`${index}-${analysis.news.link}`} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2">
                      <a
                        href={analysis.news.link}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {analysis.news.title}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{analysis.news.source}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                        score > 0 ? "text-verified" : score < 0 ? "text-risk" : "text-muted-foreground"
                      }`}
                    >
                      {score > 0 ? `+${score}` : score}
                    </td>
                    <td className="px-3 py-2">{analysis.award.award_name || "—"}</td>
                    <td className="px-3 py-2">{analysis.investment.investment_name || "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 text-[11px] font-bold ${
                          analysis.isAboutCompany
                            ? "bg-verified-surface text-verified"
                            : "bg-surface text-muted-foreground"
                        }`}
                      >
                        {analysis.isAboutCompany ? "반영" : "제외"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {state.opinion ? (
        <section className="border-[1.5px] border-ink bg-background p-4">
          <h3 className="mb-2 text-[13px] font-semibold">종합의견</h3>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{state.opinion}</p>
          {state.runId ? (
            <a
              href={`/api/reports/${state.runId}`}
              className="mt-3 inline-block text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
            >
              엑셀 리포트 내려받기
            </a>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
