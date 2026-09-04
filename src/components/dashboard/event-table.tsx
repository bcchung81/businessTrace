"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmEventsAction } from "@/app/(app)/companies/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SeverityMark, trustLabel } from "@/components/dashboard/severity-ui";
import { useUrlState } from "@/lib/hooks/useUrlState";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { KIND_LABEL, compareSeverity, type EventKind, type Severity } from "@/lib/services/eventRules";
import { kstDateShort } from "@/lib/services/kst";

const DAY_MS = 86_400_000;
const PERIODS = [30, 90] as const;
const DEFAULTS = { period: "30", open: "", page: "0" };

type Silence = { companyId: number; companyName: string; latest: string | null };
type ConfirmInput = { companyId: number; eventIds: number[]; action: "acknowledge" };
type Confirm = (input: ConfirmInput) => Promise<{ ok: true } | { ok: false; message: string }>;
type DisplayRow = { type: "event"; event: EventRow } | ({ type: "silence" } & Silence);

function severityOf(row: DisplayRow): Severity {
  return row.type === "event" ? row.event.severity : "info";
}

function dateOf(row: DisplayRow): string {
  return row.type === "event" ? row.event.occurredAt : (row.latest ?? "");
}

/**
 * 90일치 사건을 받아 기본 30일로 자르고 종류·미확인 여부로 거른다 — 기간·미확인·페이지는 URL 에 남는다.
 * 무보도 기업은 기간과 무관하게 정보 행으로 늘 섞는다 — 조용함도 살펴야 할 상태다.
 * 경보·주의는 여기서 바로 확인한다 — 훑다가 찾은 것을 다른 화면까지 들고 가지 않는다.
 */
export function EventTable({
  events,
  silence,
  pageSize = 20,
  lastEventAt = null,
  now = new Date(),
  onConfirm = confirmEventsAction,
}: {
  events: EventRow[];
  silence: Silence[];
  pageSize?: number;
  lastEventAt?: string | null;
  now?: Date;
  onConfirm?: Confirm;
}) {
  const router = useRouter();
  const [url, setUrl] = useUrlState(DEFAULTS);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EventKind>>(new Set());
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [acknowledged, setAcknowledged] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const period: (typeof PERIODS)[number] = url.period === "90" ? 90 : 30;
  const openOnly = url.open === "1";
  const page = Math.max(0, Number(url.page) || 0);

  const nowMs = now.getTime();
  const periodFiltered = events.filter((event) => nowMs - Date.parse(event.occurredAt) <= period * DAY_MS);

  const availableKinds: EventKind[] = [];
  for (const event of periodFiltered) if (!availableKinds.includes(event.kind)) availableKinds.push(event.kind);

  const statusOf = (event: EventRow) => (acknowledged.has(event.id) ? "acknowledged" : event.status);
  const kindFiltered = periodFiltered.filter((event) => !hiddenKinds.has(event.kind));
  const finalEvents = openOnly ? kindFiltered.filter((event) => statusOf(event) === "open") : kindFiltered;

  const combined: DisplayRow[] = [
    ...finalEvents.map((event): DisplayRow => ({ type: "event", event })),
    ...silence.map((entry): DisplayRow => ({ type: "silence", ...entry })),
  ];
  combined.sort((a, b) => compareSeverity(severityOf(a), severityOf(b)) || dateOf(b).localeCompare(dateOf(a)));

  const pages = Math.max(1, Math.ceil(combined.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = combined.slice(current * pageSize, current * pageSize + pageSize);

  function withoutId(ids: Set<number>, id: number) {
    const next = new Set(ids);
    next.delete(id);
    return next;
  }

  async function confirm(event: EventRow) {
    setPending((prev) => new Set(prev).add(event.id));
    setNotice(null);
    setError(null);
    try {
      const result = await onConfirm({ companyId: event.companyId, eventIds: [event.id], action: "acknowledge" });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAcknowledged((prev) => new Set(prev).add(event.id));
      setNotice("확인했습니다");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "확인 실패");
    } finally {
      setPending((prev) => withoutId(prev, event.id));
    }
  }

  function toggleKind(kind: EventKind) {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
    setUrl({ page: "0" });
  }

  const emptyMessage = lastEventAt
    ? `지난 ${period}일 사건 없음 · 마지막 사건 ${kstDateShort(lastEventAt, now)}`
    : `지난 ${period}일 사건 없음`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-0 py-2 text-[11.5px]">
        <Segmented
          label="기간"
          value={String(period)}
          options={PERIODS.map((value) => ({ value: String(value), label: `${value}일` }))}
          onChange={(value) => setUrl({ period: value, page: "0" })}
        />

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

        <div className="ml-auto flex items-center gap-3">
          {error ? <span role="alert" className="font-medium text-risk">{error}</span> : null}
          {notice && !error ? <span role="status" className="text-muted-foreground">{notice}</span> : null}
          <label className="flex items-center gap-1 font-semibold">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(event) => setUrl({ open: event.target.checked ? "1" : "", page: "0" })}
            />
            미확인만
          </label>
        </div>
      </div>

      {combined.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-[12px]">
              <caption className="sr-only">최근 이슈</caption>
              <colgroup>
                <col className="w-[60px]" />
                <col className="w-[132px]" />
                <col className="w-[104px]" />
                <col className="w-[68px]" />
                <col />
                <col className="w-[180px]" />
                <col className="w-[60px]" />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em] text-foreground">
                  <th scope="col" className="px-2 py-2 text-left font-semibold">날짜</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">기업</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-left font-semibold">심각도</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-left font-semibold">종류</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">사건</th>
                  <th scope="col" className="px-2 py-2 text-left font-semibold">근거</th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-left font-semibold">조치</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) =>
                  row.type === "event" ? (
                    <tr key={`event-${row.event.id}`} className="border-b border-hairline align-middle last:border-0">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{kstDateShort(row.event.occurredAt, now)}</td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={row.event.companyName}>
                        <Link href={`/companies/${row.event.companyId}`} className="font-semibold hover:underline">
                          {row.event.companyName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <SeverityMark severity={row.event.severity} />
                          <Badge variant="signal">{trustLabel(row.event.trust)}</Badge>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{KIND_LABEL[row.event.kind]}</td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={row.event.title}>
                        <Link href={`/companies/${row.event.companyId}#event-${row.event.id}`} className="hover:underline">
                          {row.event.title}
                        </Link>
                      </td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={row.event.evidence.map((item) => item.label).join(" · ")}>
                        {row.event.evidence.length === 0 ? (
                          <span className="text-muted-foreground/45">—</span>
                        ) : (
                          row.event.evidence.map((item, index) =>
                            item.link ? (
                              <a key={index} href={item.link} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
                                {index > 0 ? " · " : ""}{item.label}
                              </a>
                            ) : (
                              <span key={index} className="text-muted-foreground">{index > 0 ? " · " : ""}{item.label}</span>
                            ),
                          )
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {(row.event.severity === "alert" || row.event.severity === "notice") && statusOf(row.event) === "open" ? (
                          <Button variant="signal-outline" size="sm" aria-label={`${row.event.title} 확인`} disabled={pending.has(row.event.id)} onClick={() => confirm(row.event)}>
                            확인
                          </Button>
                        ) : acknowledged.has(row.event.id) ? (
                          <span className="text-[11px] text-muted-foreground">확인됨</span>
                        ) : null}
                      </td>
                    </tr>
                  ) : (
                    <tr key={`silence-${row.companyId}`} className="border-b border-hairline align-middle text-muted-foreground last:border-0">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] tabular-nums">{row.latest ? kstDateShort(row.latest, now) : "—"}</td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={row.companyName}>
                        <Link href={`/companies/${row.companyId}`} className="font-semibold text-foreground hover:underline">
                          {row.companyName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <SeverityMark severity="info" />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{KIND_LABEL.silence}</td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" colSpan={2}>
                        {`무보도 — 최근 보도 ${row.latest ? kstDateShort(row.latest, now) : "없음"}`}
                      </td>
                      <td className="px-2 py-1.5" />
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-hairline px-0 py-2 text-[11px] text-muted-foreground">
              <button type="button" onClick={() => setUrl({ page: String(current - 1) })} disabled={current === 0} className="border-[1.5px] border-hairline bg-background px-2.5 py-0.5 font-bold disabled:opacity-40">
                이전
              </button>
              <span className="font-mono tabular-nums">{current + 1} / {pages}</span>
              <button type="button" onClick={() => setUrl({ page: String(current + 1) })} disabled={current >= pages - 1} className="border-[1.5px] border-hairline bg-background px-2.5 py-0.5 font-bold disabled:opacity-40">
                다음
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
