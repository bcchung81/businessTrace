import Link from "next/link";

export type Queue = "review" | "verification";

const QUEUE_LABEL: Record<Queue, string> = { review: "확인 필요", verification: "검토 필요" };

type Neighbour = { id: number; name: string } | null;

/**
 * 상세 헤더의 이전·다음 — 큐를 따라 왔으면 큐 안에서 걷고 그 자리를 함께 보인다.
 * 큐가 있으면 링크에 queue 를 이어 붙여 다음 기업에서도 큐가 이어진다.
 */
export function NeighbourNav({
  prev,
  next,
  position,
  total,
  queue,
}: {
  prev: Neighbour;
  next: Neighbour;
  position: number | null;
  total: number;
  queue: Queue | null;
}) {
  const suffix = queue ? `?queue=${queue}` : "";
  // 큐에서 빠진 기업(방금 정리한 곳)에서는 이웃이 아니라 "다음 남은 것" 을 준다 — 이름을 대면 순서를 오해한다.
  const nextLabel = queue && position === null && next ? `다음 ${QUEUE_LABEL[queue]} 기업` : next?.name;

  return (
    <nav aria-label="기업 이동" className="flex items-center gap-2 text-[12px]">
      {queue ? (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {QUEUE_LABEL[queue]} {position === null ? "큐 밖" : `${position}/${total}`}
        </span>
      ) : null}
      {prev ? (
        <Link href={`/companies/${prev.id}${suffix}`} className="underline-offset-2 hover:underline">
          ← {prev.name}
        </Link>
      ) : (
        <span className="text-muted-foreground/45">← 처음</span>
      )}
      <span className="text-hairline">|</span>
      {next ? (
        <Link href={`/companies/${next.id}${suffix}`} className="underline-offset-2 hover:underline">
          {nextLabel} →
        </Link>
      ) : (
        <span className="text-muted-foreground/45">마지막 →</span>
      )}
    </nav>
  );
}
