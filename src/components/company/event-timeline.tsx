"use client";

import { Badge } from "@/components/ui/badge";
import { EventReviewButtons } from "@/components/dashboard/event-review-buttons";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { KIND_LABEL, type Severity, type Trust } from "@/lib/services/eventRules";
import { STATUS_LABEL } from "@/lib/services/eventReview";

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
 * 기업 상세의 사건 이력을 최신순 세로 타임라인으로 낸다.
 * 메모 입력을 조치 버튼과 같은 `form` 안에 둬 상태 전이와 메모 저장을 한 제출로 묶는다 — 메모만 저장하는 버튼은 두지 않는다.
 */
export function EventTimeline({ events, path }: { events: EventRow[]; path: string }) {
  if (events.length === 0) {
    return (
      <p className="rounded-[10px] p-6 text-center text-[13px] text-muted-foreground">
        기록된 사건이 없습니다.
      </p>
    );
  }

  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <ul className="flex flex-col gap-4 p-3.5">
      {sorted.map((event) => (
        <li key={event.id} className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{event.occurredAt.slice(0, 10)}</span>
            <span className={`flex items-center gap-1 font-semibold ${SEVERITY_CLASS[event.severity]}`}>
              <SeverityIcon severity={event.severity} />
              {KIND_LABEL[event.kind]}
            </span>
            <Badge variant="ink">{trustLabel(event.trust)}</Badge>
            <span>{STATUS_LABEL[event.status]}</span>
          </div>

          <p className="text-[13px] font-medium">{event.title}</p>

          {event.evidence.length > 0 ? (
            <div className="flex flex-wrap gap-2 text-[12px]">
              {event.evidence.map((item, index) =>
                item.link ? (
                  <a
                    key={index}
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span key={index} className="text-muted-foreground">
                    {item.label}
                  </span>
                ),
              )}
            </div>
          ) : null}

          <EventReviewButtons id={event.id} status={event.status} path={path} allowReopen>
            <textarea
              name="note"
              defaultValue={event.note ?? ""}
              placeholder="메모"
              rows={2}
              className="w-full max-w-md rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px]"
            />
          </EventReviewButtons>
        </li>
      ))}
    </ul>
  );
}
