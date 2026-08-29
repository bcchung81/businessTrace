import { prisma } from "@/lib/db";

const KST_OFFSET_MS = 9 * 3_600_000;
import { SOURCE_KEYS, type SnapshotRow, type SourceKey, type SourceStatus } from "@/lib/services/sourceEvidence";

export type StoredSnapshot = {
  source: SourceKey;
  status: SourceStatus;
  summary: string;
  payload: unknown;
  fetchedAt: Date;
};

function order(source: string) {
  const index = SOURCE_KEYS.indexOf(source as SourceKey);
  return index === -1 ? SOURCE_KEYS.length : index;
}

/**
 * 원천별 조회 결과를 기업당 한 행씩 갱신한다.
 * 이력을 쌓지 않는다 — 화면이 필요한 것은 "지금 무엇을 대조할 수 있나"이지 조회 로그가 아니다.
 */
export async function saveSourceSnapshots(companyId: number, rows: SnapshotRow[]) {
  for (const row of rows) {
    const data = {
      status: row.status,
      summary: row.summary,
      payload: JSON.stringify(row.payload ?? null),
      fetchedAt: new Date(),
    };

    await prisma.sourceSnapshot.upsert({
      where: { companyId_source: { companyId, source: row.source } },
      create: { companyId, source: row.source, ...data },
      update: data,
    });
  }

  return rows.length;
}

/**
 * 저장된 원천 스냅샷을 화면이 읽는 순서대로 낸다.
 */
export async function listSourceSnapshots(companyId: number): Promise<StoredSnapshot[]> {
  const rows = await prisma.sourceSnapshot.findMany({ where: { companyId } });

  return rows
    .sort((a, b) => order(a.source) - order(b.source))
    .map((row) => ({
      source: row.source as SourceKey,
      status: row.status as SourceStatus,
      summary: row.summary ?? "",
      payload: JSON.parse(row.payload) as unknown,
      fetchedAt: row.fetchedAt,
    }));
}

export type SourceCoverage = {
  total: number;
  bySource: Array<{ source: SourceKey; found: number }>;
};

/**
 * 연도별로 각 원천이 실제로 확인해 준 기업 수를 센다.
 * found 만 센다 - 결측·측정 불가·미조회는 커버리지가 아니다.
 */
export async function summariseSourceCoverage(year: number): Promise<SourceCoverage> {
  const total = await prisma.company.count({ where: { year, isActive: true } });
  const rows = await prisma.sourceSnapshot.findMany({
    where: { status: "found", company: { year, isActive: true } },
    select: { source: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.source, (counts.get(row.source) ?? 0) + 1);

  return {
    total,
    bySource: SOURCE_KEYS.map((source) => ({ source, found: counts.get(source) ?? 0 })),
  };
}

/**
 * 원천 수집의 최신 시각과 그날 갱신된 기업 수를 낸다.
 * 날은 KST 기준이다 — 밤 수집이 UTC 로 전날에 걸리면 "오늘 0개사" 로 오독된다.
 */
export async function summariseSourceFreshness(year: number) {
  const latest = await prisma.sourceSnapshot.findFirst({
    where: { company: { year, isActive: true } },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });
  if (!latest) return { latestAt: null, updatedOnLatestDay: 0 };

  const dayStart = new Date(latest.fetchedAt.getTime() + KST_OFFSET_MS);
  dayStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(dayStart.getTime() - KST_OFFSET_MS);

  const rows = await prisma.sourceSnapshot.findMany({
    where: { fetchedAt: { gte: since }, company: { year, isActive: true } },
    select: { companyId: true },
    distinct: ["companyId"],
  });
  return { latestAt: latest.fetchedAt.toISOString(), updatedOnLatestDay: rows.length };
}
