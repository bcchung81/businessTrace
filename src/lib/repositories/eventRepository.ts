import { prisma } from "@/lib/db";
import { compareSeverity, type Evidence, type EventKind, type NewEvent, type Severity, type Trust } from "@/lib/services/eventRules";
import { transition, type EventStatus, type ReviewAction } from "@/lib/services/eventReview";

export type EventRow = {
  id: number;
  companyId: number;
  companyName: string;
  kind: EventKind;
  severity: Severity;
  occurredAt: string;
  title: string;
  evidence: Evidence[];
  runId: number | null;
  trust: Trust;
  status: EventStatus;
  note: string | null;
  reviewedAt: string | null;
};

type Stored = {
  id: number;
  companyId: number;
  kind: string;
  severity: string;
  occurredAt: Date;
  title: string;
  evidenceJson: string;
  runId: number | null;
  trust: string | null;
  status: string;
  note: string | null;
  reviewedAt: Date | null;
  company: { name: string };
};

function toRow(row: Stored): EventRow {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    kind: row.kind as EventKind,
    severity: row.severity as Severity,
    occurredAt: row.occurredAt.toISOString(),
    title: row.title,
    evidence: JSON.parse(row.evidenceJson) as Evidence[],
    runId: row.runId,
    trust: (row.trust as Trust) ?? null,
    status: row.status as EventStatus,
    note: row.note,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * 사건을 (기업, 종류, 근거 키) 로 upsert 한다. 담당자의 상태·메모는 재추출이 덮어쓰지 않는다.
 */
export async function upsertEvents(events: NewEvent[]) {
  let created = 0;
  let updated = 0;
  for (const event of events) {
    const where = { companyId_kind_evidenceKey: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey } };
    const fields = { severity: event.severity, occurredAt: event.occurredAt, title: event.title, evidenceJson: JSON.stringify(event.evidence), runId: event.runId, trust: event.trust };
    const existing = await prisma.event.findUnique({ where, select: { id: true } });
    if (existing) {
      await prisma.event.update({ where, data: fields });
      updated += 1;
    } else {
      await prisma.event.create({ data: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey, ...fields } });
      created += 1;
    }
  }
  return { created, updated };
}

/**
 * 연도의 사건을 심각도 → 최신순으로 낸다. since/until 은 occurredAt 기준이다.
 */
export async function listEvents(input: { year: number; since?: Date; until?: Date; kinds?: EventKind[]; status?: EventStatus[]; companyId?: number }): Promise<EventRow[]> {
  const rows = await prisma.event.findMany({
    where: {
      company: { year: input.year, isActive: true },
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.kinds ? { kind: { in: input.kinds } } : {}),
      ...(input.status ? { status: { in: input.status } } : {}),
      ...(input.since || input.until ? { occurredAt: { ...(input.since ? { gte: input.since } : {}), ...(input.until ? { lte: input.until } : {}) } } : {}),
    },
    include: { company: { select: { name: true } } },
  });
  return rows.map(toRow).sort((a, b) => compareSeverity(a.severity, b.severity) || b.occurredAt.localeCompare(a.occurredAt));
}

/**
 * 연도 활성 기업의 가장 최근 사건 발생일을 낸다.
 * listEvents 는 심각도 우선 정렬이라 "마지막 사건"에 쓸 수 없다 — 여기는 occurredAt 만으로 정렬한다.
 */
export async function latestEventAt(year: number): Promise<string | null> {
  const row = await prisma.event.findFirst({
    where: { company: { year, isActive: true } },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  return row?.occurredAt.toISOString() ?? null;
}

/**
 * 담당자 조치를 기록한다. 불허 전이는 저장 전에 던진다.
 * `note` 는 `null` 이면 기존 메모를 그대로 두고, 빈 문자열이면 지우고, 그 밖의 문자열이면 저장한다.
 */
export async function reviewEvent(id: number, action: ReviewAction, note: string | null, userId: number): Promise<EventRow> {
  const current = await prisma.event.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const status = transition(current.status as EventStatus, action);
  const row = await prisma.event.update({
    where: { id },
    data: { status, note: note === null ? undefined : note === "" ? null : note, reviewedAt: new Date(), reviewedBy: userId },
    include: { company: { select: { name: true } } },
  });
  return toRow(row);
}

/**
 * 헤더 요약문에 쓸 집계.
 */
export async function summariseEvents(year: number, since: Date) {
  const rows = await listEvents({ year, since });
  const bySeverity: Record<Severity, number> = { alert: 0, notice: 0, positive: 0, info: 0 };
  for (const row of rows) bySeverity[row.severity] += 1;
  return { total: rows.length, companiesWithEvents: new Set(rows.map((r) => r.companyId)).size, bySeverity, open: rows.filter((r) => r.status === "open").length };
}
