import { Badge } from "@/components/ui/badge";
import { SeverityMark, trustLabel } from "@/components/dashboard/severity-ui";
import type { EventRow } from "@/lib/repositories/eventRepository";
import { KIND_LABEL } from "@/lib/services/eventRules";
import { STATUS_LABEL } from "@/lib/services/eventReview";
import { kstDate } from "@/lib/services/kst";

/**
 * 기업 상세의 사건 이력 — 사건 하나가 표 한 행이다. 최신순, 읽기 전용.
 * 홈의 사건 표와 같은 열 문법을 쓴다 — 기업 열만 없다.
 */
export function EventTimeline({ events }: { events: EventRow[] }) {
  if (events.length === 0) {
    return <p className="p-6 text-center text-[13px] text-muted-foreground">기록된 사건이 없습니다.</p>;
  }

  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <caption className="sr-only">사건 이력</caption>
        <thead>
          <tr className="border-b-2 border-ink text-[11px] font-bold tracking-[0.06em] text-foreground">
            <th scope="col" className="px-2 py-2 text-left">날짜</th>
            <th scope="col" className="whitespace-nowrap px-2 py-2 text-left">심각도</th>
            <th scope="col" className="whitespace-nowrap px-2 py-2 text-left">종류</th>
            <th scope="col" className="px-2 py-2 text-left">신뢰</th>
            <th scope="col" className="px-2 py-2 text-left">상태</th>
            <th scope="col" className="px-2 py-2 text-left">사건</th>
            <th scope="col" className="px-2 py-2 text-left">근거</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((event) => (
            <tr
              key={event.id}
              id={`event-${event.id}`}
              className="border-b border-hairline align-middle scroll-mt-24 target:bg-accent last:border-0"
            >
              <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">{kstDate(event.occurredAt)}</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <SeverityMark severity={event.severity} />
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{KIND_LABEL[event.kind]}</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <Badge variant="signal">{trustLabel(event.trust)}</Badge>
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{STATUS_LABEL[event.status]}</td>
              <td className="min-w-[240px] max-w-[420px] break-keep px-2 py-1.5">{event.title}</td>
              <td className="max-w-[240px] truncate whitespace-nowrap px-2 py-1.5" title={event.evidence.map((item) => item.label).join(" · ")}>
                {event.evidence.length === 0 ? (
                  <span className="text-muted-foreground/45">—</span>
                ) : (
                  event.evidence.map((item, index) =>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
