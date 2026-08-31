import { prisma } from "@/lib/db";
import { compareSeverity, isSameStory, NEWS_EVENT_KINDS, STORY_WINDOW_DAYS, type Evidence, type EventKind, type NewEvent, type Severity, type Trust } from "@/lib/services/eventRules";
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
 * 더는 충돌이 아닌 원천의 열린 동명 충돌 사건을 자동으로 닫는다 — 결정·재조회로 해소된 것을 두 번 묻지 않기 위해서다.
 */
export async function closeResolvedConflictEvents(companyId: number, liveConflictKeys: string[]): Promise<number> {
  const result = await prisma.event.updateMany({
    where: { companyId, kind: "source_conflict", status: "open", evidenceKey: { notIn: liveConflictKeys } },
    data: { status: "done", note: "충돌 해소로 자동 정리", reviewedAt: new Date() },
  });
  return result.count;
}

function isGoogleProxy(evidenceKey: string) {
  return evidenceKey.includes("news.google.com");
}

/**
 * (기업, 종류, 제목) 이 같은 중복 사건을 한 건으로 병합한다 — 같은 기사가 원문 URL 과 구글 프록시 URL 로 두 번 잡힌 이력 정리용.
 * 담당자 기록(status·note)이 있는 행을 남기되, 근거는 구글 프록시보다 원문 URL 쪽을 택한다.
 */
export async function mergeDuplicateEvents(): Promise<{ merged: number; deleted: number }> {
  const rows = await prisma.event.findMany({ orderBy: { id: "asc" } });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.companyId}\u0000${row.kind}\u0000${row.title}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let merged = 0;
  let deleted = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = [...group].sort((a, b) => Number(a.status === "open") - Number(b.status === "open") || a.id - b.id)[0];
    const donor = group.find((row) => !isGoogleProxy(row.evidenceKey));
    const drop = group.filter((row) => row.id !== keep.id).map((row) => row.id);
    await prisma.event.deleteMany({ where: { id: { in: drop } } });
    if (donor && donor.id !== keep.id && isGoogleProxy(keep.evidenceKey)) {
      await prisma.event.update({ where: { id: keep.id }, data: { evidenceKey: donor.evidenceKey, evidenceJson: donor.evidenceJson } });
    }
    merged += 1;
    deleted += drop.length;
  }

  const clustered = await clusterStoryEvents();
  return { merged: merged + clustered.merged, deleted: deleted + clustered.deleted };
}

/**
 * 뉴스 종류의 기존 사건 중 같은 실제 사건(7일 창, 제목 유사)을 하나로 모은다.
 * 근거는 합집합으로 합치고 담당자 기록이 있는 행을 남긴다.
 */
async function clusterStoryEvents(): Promise<{ merged: number; deleted: number }> {
  const rows = await prisma.event.findMany({ where: { kind: { in: NEWS_EVENT_KINDS } }, orderBy: { id: "asc" } });
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.companyId}\u0000${row.kind}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let merged = 0;
  let deleted = 0;
  for (const group of groups.values()) {
    const clusters: Array<typeof rows> = [];
    for (const row of group) {
      const ref = { companyId: row.companyId, kind: row.kind as EventKind, occurredAt: row.occurredAt, title: row.title };
      const home = clusters.find((cluster) =>
        cluster.some((member) => isSameStory(ref, { companyId: member.companyId, kind: member.kind as EventKind, occurredAt: member.occurredAt, title: member.title })),
      );
      if (home) home.push(row);
      else clusters.push([row]);
    }

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const keep = [...cluster].sort((a, b) => Number(a.status === "open") - Number(b.status === "open") || a.id - b.id)[0];
      const donor = cluster.find((row) => !isGoogleProxy(row.evidenceKey));
      const evidence: Evidence[] = [];
      for (const row of [keep, ...cluster.filter((r) => r.id !== keep.id)]) {
        for (const entry of JSON.parse(row.evidenceJson) as Evidence[]) {
          if (!evidence.some((held) => held.link === entry.link && held.label === entry.label)) evidence.push(entry);
        }
      }
      const drop = cluster.filter((row) => row.id !== keep.id).map((row) => row.id);
      await prisma.event.deleteMany({ where: { id: { in: drop } } });
      const evidenceKey = donor && isGoogleProxy(keep.evidenceKey) ? donor.evidenceKey : keep.evidenceKey;
      await prisma.event.update({ where: { id: keep.id }, data: { evidenceKey, evidenceJson: JSON.stringify(evidence) } });
      merged += 1;
      deleted += drop.length;
    }
  }
  return { merged, deleted };
}

const DAY_MS = 86_400_000;

/**
 * 새 사건과 같은 실제 사건인 기존 행을 찾는다 — 뉴스 종류만, ±7일 창에서 제목 유사도로 판정한다.
 */
async function findSameStoryEvent(event: NewEvent) {
  if (!NEWS_EVENT_KINDS.includes(event.kind)) return null;
  const windowMs = STORY_WINDOW_DAYS * DAY_MS;
  const candidates = await prisma.event.findMany({
    where: {
      companyId: event.companyId,
      kind: event.kind,
      occurredAt: { gte: new Date(event.occurredAt.getTime() - windowMs), lte: new Date(event.occurredAt.getTime() + windowMs) },
    },
    select: { id: true, companyId: true, kind: true, occurredAt: true, title: true, evidenceJson: true },
  });
  return candidates.find((row) => isSameStory(event, { companyId: row.companyId, kind: row.kind as EventKind, occurredAt: row.occurredAt, title: row.title })) ?? null;
}

/**
 * 사건을 (기업, 종류, 근거 키) 로 upsert 한다. 담당자의 상태·메모는 재추출이 덮어쓰지 않는다.
 * 같은 실제 사건의 다른 기사는 새 행이 아니라 기존 사건의 근거로 접는다 — 중복 기사를 개별 건수로 세지 않는다.
 */
export async function upsertEvents(events: NewEvent[]) {
  let created = 0;
  let updated = 0;
  let merged = 0;
  for (const event of events) {
    const where = { companyId_kind_evidenceKey: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey } };
    const fields = { severity: event.severity, occurredAt: event.occurredAt, title: event.title, evidenceJson: JSON.stringify(event.evidence), runId: event.runId, trust: event.trust };
    const existing = await prisma.event.findUnique({ where, select: { id: true } });
    if (existing) {
      await prisma.event.update({ where, data: fields });
      updated += 1;
      continue;
    }
    const twin = await findSameStoryEvent(event);
    if (twin) {
      const evidence = JSON.parse(twin.evidenceJson) as Evidence[];
      const additions = event.evidence.filter((entry) => !evidence.some((held) => held.link === entry.link && held.label === entry.label));
      if (additions.length > 0) {
        await prisma.event.update({ where: { id: twin.id }, data: { evidenceJson: JSON.stringify([...evidence, ...additions]) } });
      }
      merged += 1;
      continue;
    }
    await prisma.event.create({ data: { companyId: event.companyId, kind: event.kind, evidenceKey: event.evidenceKey, ...fields } });
    created += 1;
  }
  return { created, updated, merged };
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
  return rows.map(toRow).sort((a, b) => compareSeverity(a.severity, b.severity) || b.occurredAt.localeCompare(a.occurredAt) || a.id - b.id);
}

/**
 * 사건이 한 번이라도 기록된 기업 id — 목록에서 "무보도" 와 "사건 없음" 을 가른다.
 */
export async function listCompanyIdsWithEvents(year: number): Promise<number[]> {
  const rows = await prisma.event.findMany({ where: { company: { year, isActive: true } }, select: { companyId: true }, distinct: ["companyId"] });
  return rows.map((row) => row.companyId);
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
