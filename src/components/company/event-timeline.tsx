"use client";

import { Badge } from "@/components/ui/badge";
import { EventReviewButtons } from "@/components/dashboard/event-review-buttons";
import { SEVERITY_CLASS, SeverityIcon, trustLabel } from "@/components/dashboard/severity-ui";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { KIND_LABEL } from "@/lib/services/eventRules";
import { STATUS_LABEL } from "@/lib/services/eventReview";
import { kstDate } from "@/lib/services/kst";

/**
 * 기업 상세의 사건 이력을 최신순 세로 타임라인으로 낸다.
 * 메모 입력을 조치 버튼과 같은 `form` 안에 둬 상태 전이와 메모 저장을 한 제출로 묶는다 — 메모만 저장하는 버튼은 두지 않는다.
 */
export function EventTimeline({ events, path }: { events: EventRow[]; path: string }) {
  if (events.length === 0) {
    return (
      <p className="p-6 text-center text-[13px] text-muted-foreground">
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
            <span className="font-mono tabular-nums">{kstDate(event.occurredAt)}</span>
            <span className={`flex items-center gap-1 font-semibold ${SEVERITY_CLASS[event.severity]}`}>
              <SeverityIcon severity={event.severity} />
              {KIND_LABEL[event.kind]}
            </span>
            <Badge variant="signal">{trustLabel(event.trust)}</Badge>
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
                    className="underline decoration-dotted underline-offset-2"
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
              className="w-full max-w-md border-[1.5px] border-hairline bg-background px-2.5 py-1.5 text-[12px] focus-visible:border-ink focus-visible:outline-none"
            />
          </EventReviewButtons>
        </li>
      ))}
    </ul>
  );
}
