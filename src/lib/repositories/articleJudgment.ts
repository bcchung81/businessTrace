import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { parseAliases } from "@/lib/services/collectForCompany";

export type JudgmentOrigin = "held" | "gate" | "manual";

export type JudgmentAnswer = { entity: string | null; role: string | null; form: string | null; about: string | null; note: string | null };

export type EnqueueInput = {
  companyId: number;
  link: string;
  title: string;
  source: string;
  published: string;
  body: string;
  origin: JudgmentOrigin;
  model: Record<string, unknown>;
  setKey?: string | null;
  stratum?: string | null;
  required?: boolean;
};

export type JudgmentRow = JudgmentAnswer & {
  id: number;
  companyId: number;
  link: string;
  title: string;
  source: string;
  published: string;
  body: string;
  origin: JudgmentOrigin;
  setKey: string | null;
  stratum: string | null;
  required: boolean;
  modelJson: string;
  judgedAt: Date | null;
  queuedAt: Date;
  company: { name: string; officialName: string | null; industry: string | null; ceoName: string | null; aliases: string[] };
};

const WITH_COMPANY = { include: { company: { select: { name: true, officialName: true, industry: true, ceoName: true, aliases: true } } } } as const;

type StoredJudgment = Prisma.ArticleJudgmentGetPayload<typeof WITH_COMPANY>;

const ANSWER_FIELDS = ["entity", "role", "form", "about", "note"] as const;

const isUniqueViolation = (caught: unknown) => caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002";

function toRow(stored: StoredJudgment): JudgmentRow {
  return { ...stored, origin: stored.origin as JudgmentOrigin, company: { ...stored.company, aliases: parseAliases(stored.company.aliases) } };
}

/**
 * 기사를 판정 대기열에 올리고 새로 만든 행 수를 낸다. 이미 있는 (기업, 링크)는 건드리지 않는다.
 * 보류·게이트·수동이 같은 기사를 다시 올려도 사람이 내린 판정과 처음 출처가 그대로 남는다.
 */
export async function enqueueJudgments(rows: EnqueueInput[], now = new Date()): Promise<number> {
  let created = 0;
  for (const row of rows) {
    const existing = await prisma.articleJudgment.findUnique({ where: { companyId_link: { companyId: row.companyId, link: row.link } }, select: { id: true } });
    if (existing) continue;
    try {
      await prisma.articleJudgment.create({
        data: {
          companyId: row.companyId,
          link: row.link,
          title: row.title,
          source: row.source,
          published: row.published,
          body: row.body,
          origin: row.origin,
          setKey: row.setKey ?? null,
          stratum: row.stratum ?? null,
          required: row.required ?? false,
          modelJson: JSON.stringify(row.model),
          queuedAt: now,
        },
      });
      created += 1;
    } catch (caught) {
      if (!isUniqueViolation(caught)) throw caught;
    }
  }
  return created;
}

/**
 * 준 필드만 바꾼다. 주제 판정(about)을 값으로 두면 누가 언제 내렸는지 적고, 되돌리면 지운다 — 반영 대기가 이 시각을 본다.
 */
export async function saveJudgment(id: number, patch: Partial<JudgmentAnswer>, userId: number, now = new Date()): Promise<JudgmentRow> {
  const data: Prisma.ArticleJudgmentUpdateInput = {};
  for (const field of ANSWER_FIELDS) {
    if (patch[field] !== undefined) data[field] = patch[field];
  }
  if (patch.about !== undefined) {
    data.judgedAt = patch.about === null ? null : now;
    data.judgedBy = patch.about === null ? null : userId;
  }
  return toRow(await prisma.articleJudgment.update({ where: { id }, data, ...WITH_COMPANY }));
}

/**
 * 다음 분석에 적용할 사람 판정 — "주제 아님"은 빼고 "주제"는 넣는다. 모름과 미판정은 영향이 없다.
 */
export async function judgmentOverrides(companyId: number): Promise<{ exclude: string[]; include: string[] }> {
  const rows = await prisma.articleJudgment.findMany({ where: { companyId, about: { in: ["yes", "no"] } }, select: { link: true, about: true }, orderBy: { id: "asc" } });
  return { exclude: rows.filter((row) => row.about === "no").map((row) => row.link), include: rows.filter((row) => row.about === "yes").map((row) => row.link) };
}

export async function countPendingJudgments(): Promise<number> {
  return prisma.articleJudgment.count({ where: { about: null, company: { isActive: true } } });
}

/**
 * 판정이 마지막으로 끝낸 분석보다 늦은 활성 기업 — 다시 분석해야 판정이 결과에 들어간다.
 * 수집만 한 실행과 실패한 실행은 "끝낸 분석"이 아니다. 끝낸 분석이 없으면 판정만으로 반영 대기다.
 */
export async function listReflectPending(): Promise<Array<{ companyId: number; name: string; judged: number }>> {
  const judged = await prisma.articleJudgment.findMany({
    where: { about: { in: ["yes", "no"] }, judgedAt: { not: null }, company: { isActive: true } },
    select: {
      companyId: true,
      judgedAt: true,
      company: { select: { name: true, analysisRuns: { where: { status: { in: ["completed", "no_news"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } } },
    },
  });
  const pending = new Map<number, { companyId: number; name: string; judged: number }>();
  for (const row of judged) {
    const lastRun = row.company.analysisRuns[0]?.createdAt;
    if (lastRun && row.judgedAt! <= lastRun) continue;
    const entry = pending.get(row.companyId) ?? { companyId: row.companyId, name: row.company.name, judged: 0 };
    entry.judged += 1;
    pending.set(row.companyId, entry);
  }
  return [...pending.values()].sort((a, b) => a.companyId - b.companyId);
}

/**
 * 판정 화면의 대기열 — 활성 기업만, 필수 게이트 표본을 먼저 두고 나머지는 올라온 순서다.
 */
export async function listJudgments(): Promise<JudgmentRow[]> {
  const rows = await prisma.articleJudgment.findMany({
    where: { company: { isActive: true } },
    orderBy: [{ required: "desc" }, { queuedAt: "asc" }, { id: "asc" }],
    ...WITH_COMPANY,
  });
  return rows.map(toRow);
}

export async function findJudgmentsByLink(companyId: number): Promise<Map<string, { id: number; about: string | null }>> {
  const rows = await prisma.articleJudgment.findMany({ where: { companyId }, select: { id: true, link: true, about: true } });
  return new Map(rows.map((row) => [row.link, { id: row.id, about: row.about }]));
}

export async function listGateLabels(setKey: string): Promise<Array<{ companyId: number; link: string; about: string | null; stratum: string | null }>> {
  return prisma.articleJudgment.findMany({ where: { setKey }, select: { companyId: true, link: true, about: true, stratum: true }, orderBy: { id: "asc" } });
}
