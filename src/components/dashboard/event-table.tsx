"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EventReviewButtons } from "@/components/dashboard/event-review-buttons";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { KIND_LABEL, SEVERITY_LABEL, compareSeverity, type EventKind, type Severity, type Trust } from "@/lib/services/eventRules";
import { STATUS_LABEL } from "@/lib/services/eventReview";
import { kstMonthDay } from "@/lib/services/kst";

const DAY_MS = 86_400_000;
const PERIODS = [30, 90] as const;
const DASHBOARD_PATH = "/dashboard";

type Silence = { companyId: number; companyName: string; latest: string | null };
type DisplayRow = { type: "event"; event: EventRow } | ({ type: "silence" } & Silence);

const SEVERITY_CLASS: Record<Severity, string> = {
  alert: "text-risk",
  notice: "text-review",
  positive: "text-verified",
  info: "text-muted-foreground",
};

function trustLabel(trust: Trust) {
  if (trust === "verified") return "근거 확인";
  if (trust === "needs_review") return "확인 필요";
  return "실측";
}

function severityOf(row: DisplayRow): Severity {
  return row.type === "event" ? row.event.severity : "info";
}

function dateOf(row: DisplayRow): string {
  return row.type === "event" ? row.event.occurredAt : (row.latest ?? "");
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const common = { viewBox: "0 0 12 12", fill: "none" as const, stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, className: "h-3 w-3 flex-none" };
  switch (severity) {
    case "alert":
      return <svg {...common}><path d="M6 1.5 11 10.5H1z" /><path d="M6 5v2.5" /></svg>;
    case "notice":
      return <svg {...common}><circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v3l2 1" /></svg>;
    case "positive":
      return <svg {...common} strokeWidth={1.8}><path d="M2.5 6.5 5 9l4.5-6" /></svg>;
    default:
      return <svg {...common}><circle cx="6" cy="6" r="4.5" strokeDasharray="2 2" /></svg>;
  }
}

/**
 * 90일치 사건을 받아 기본 30일로 자르고 종류·미확인 여부로 거른다.
 * 무보도 기업은 기간과 무관하게 정보 행으로 늘 섞는다 — 조용함도 살펴야 할 상태다.
 */
export function EventTable({
  events,
  silence,
  pageSize = 20,
  lastEventAt = null,
  now = new Date(),
}: {
  events: EventRow[];
  silence: Silence[];
  pageSize?: number;
  lastEventAt?: string | null;
  now?: Date;
}) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EventKind>>(new Set());
  const [openOnly, setOpenOnly] = useState(false);
  const [page, setPage] = useState(0);

  const nowMs = now.getTime();
  const periodFiltered = events.filter((event) => nowMs - Date.parse(event.occurredAt) <= period * DAY_MS);

  const availableKinds: EventKind[] = [];
  for (const event of periodFiltered) if (!availableKinds.includes(event.kind)) availableKinds.push(event.kind);

  const kindFiltered = periodFiltered.filter((event) => !hiddenKinds.has(event.kind));
  const finalEvents = openOnly ? kindFiltered.filter((event) => event.status === "open") : kindFiltered;

  const combined: DisplayRow[] = [
    ...finalEvents.map((event): DisplayRow => ({ type: "event", event })),
    ...silence.map((entry): DisplayRow => ({ type: "silence", ...entry })),
  ];
  combined.sort((a, b) => compareSeverity(severityOf(a), severityOf(b)) || dateOf(b).localeCompare(dateOf(a)));

  const pages = Math.max(1, Math.ceil(combined.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = combined.slice(current * pageSize, current * pageSize + pageSize);

  function toggleKind(kind: EventKind) {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
    setPage(0);
  }

  const emptyMessage = lastEventAt
    ? `지난 ${period}일 사건 없음 · 마지막 사건 ${kstMonthDay(lastEventAt)}`
    : `지난 ${period}일 사건 없음`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-3 py-2 text-[11.5px]">
        <div role="radiogroup" aria-label="기간" className="flex items-center gap-1 rounded-[7px] bg-secondary p-0.5">
          {PERIODS.map((value) => {
            const selected = value === period;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setPeriod(value);
                  setPage(0);
                }}
                className={`rounded-[5px] px-2.5 py-1 ${selected ? "bg-background font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground"}`}
              >
                {value}일
              </button>
            );
          })}
        </div>

        {availableKinds.length > 0 ? (
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">종류</legend>
            {availableKinds.map((kind) => (
              <label key={kind} className="flex items-center gap-1 text-muted-foreground">
                <input type="checkbox" checked={!hiddenKinds.has(kind)} onChange={() => toggleKind(kind)} />
                {KIND_LABEL[kind]}
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="ml-auto flex items-center gap-1 font-semibold">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(event) => {
              setOpenOnly(event.target.checked);
              setPage(0);
            }}
          />
          미확인만
        </label>
      </div>

      {combined.length === 0 ? (
        <p className="rounded-[10px] p-6 text-center text-[13px] text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="w-full text-[12px]">
              <caption className="sr-only">이달의 사건</caption>
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] text-muted-foreground">
                  <th scope="col" className="px-2 py-2 text-left font-semibold">날짜</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">기업</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">심각도</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">종류</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">사건</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">근거</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">신뢰</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">상태</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">조치</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) =>
                  row.type === "event" ? (
                    <tr key={`event-${row.event.id}`} className="border-b border-hairline align-middle last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{kstMonthDay(row.event.occurredAt)}</td>
                      <td className="px-2 py-1.5">
                        <Link href={`/companies/${row.event.companyId}`} className="font-semibold hover:underline">
                          {row.event.companyName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`flex items-center gap-1 font-semibold ${SEVERITY_CLASS[row.event.severity]}`}>
                          <SeverityIcon severity={row.event.severity} />
                          {SEVERITY_LABEL[row.event.severity]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{KIND_LABEL[row.event.kind]}</td>
                      <td className="px-2 py-1.5">{row.event.title}</td>
                      <td className="px-2 py-1.5">
                        {row.event.evidence.length === 0 ? (
                          <span className="text-muted-foreground/45">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {row.event.evidence.map((item, index) =>
                              item.link ? (
                                <a key={index} href={item.link} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                                  {item.label}
                                </a>
                              ) : (
                                <span key={index} className="text-muted-foreground">{item.label}</span>
                              ),
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge variant="ink">{trustLabel(row.event.trust)}</Badge>
                      </td>
                      <td className="px-2 py-1.5">{STATUS_LABEL[row.event.status]}</td>
                      <td className="px-2 py-1.5">
                        <EventReviewButtons id={row.event.id} status={row.event.status} path={DASHBOARD_PATH} allowReopen={false} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={`silence-${row.companyId}`} className="border-b border-hairline align-middle text-muted-foreground last:border-0">
                      <td className="px-2 py-1.5 font-mono text-[11px] tabular-nums">{row.latest ? kstMonthDay(row.latest) : "—"}</td>
                      <td className="px-2 py-1.5">
                        <Link href={`/companies/${row.companyId}`} className="font-semibold text-foreground hover:underline">
                          {row.companyName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1 font-semibold">
                          <SeverityIcon severity="info" />
                          {SEVERITY_LABEL.info}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{KIND_LABEL.silence}</td>
                      <td className="px-2 py-1.5" colSpan={3}>
                        {`무보도 — 최근 보도 ${row.latest ? kstMonthDay(row.latest) : "없음"}`}
                      </td>
                      <td className="px-2 py-1.5">—</td>
                      <td className="px-2 py-1.5" />
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
              <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
                이전
              </button>
              <span className="font-mono tabular-nums">{current + 1} / {pages}</span>
              <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className="rounded-[5px] border border-border bg-background px-2 py-0.5 disabled:opacity-40">
                다음
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
