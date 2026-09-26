import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import {
  countPendingJudgments,
  enqueueJudgments,
  findJudgmentsByLink,
  judgmentOverrides,
  listGateLabels,
  listJudgments,
  listReflectPending,
  saveJudgment,
  type EnqueueInput,
} from "@/lib/repositories/articleJudgment";

const T0 = new Date("2026-09-26T01:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function row(companyId: number, link: string, patch: Partial<EnqueueInput> = {}): EnqueueInput {
  return { companyId, link, title: `제목 ${link}`, source: "전자신문", published: "2026-09-20", body: "본문", origin: "held", model: { analyzer: "llm", confidence: 0.5 }, ...patch };
}

async function seed() {
  const company = await prisma.company.create({ data: { name: "누아", year: 2025, officialName: "주식회사 누아", industry: "클라우드", ceoName: "서덕진", aliases: JSON.stringify(["NUA"]) } });
  const user = await prisma.user.create({ data: { email: `j-${company.id}@example.com`, passwordHash: "x" } });
  return { company, user };
}

async function runAt(companyId: number, userId: number, status: string, createdAt: Date) {
  return prisma.analysisRun.create({ data: { companyId, userId, model: "m", newsJson: "[]", status, createdAt } });
}

describe("article judgments", () => {
  beforeEach(resetDatabase);

  it("queues an article once — the same company and link twice makes one row", async () => {
    const { company } = await seed();

    expect(await enqueueJudgments([row(company.id, "https://n/1")])).toBe(1);
    expect(await enqueueJudgments([row(company.id, "https://n/1", { origin: "manual" })])).toBe(0);
    expect(await prisma.articleJudgment.count()).toBe(1);
  });

  it("keeps a human judgment and its origin when the article is queued again", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1", { origin: "gate" })]);
    const [queued] = await prisma.articleJudgment.findMany();
    await saveJudgment(queued.id, { about: "no" }, user.id, T0);

    await enqueueJudgments([row(company.id, "https://n/1", { origin: "manual" })]);

    const stored = await prisma.articleJudgment.findUniqueOrThrow({ where: { id: queued.id } });
    expect(stored).toMatchObject({ about: "no", origin: "gate" });
  });

  it("changes only the fields it is given and stamps who judged and when", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1")]);
    const [queued] = await prisma.articleJudgment.findMany();

    await saveJudgment(queued.id, { about: "yes", entity: "same" }, user.id, T0);
    const noted = await saveJudgment(queued.id, { note: "협약 당사자" }, user.id, at(5));

    expect(noted).toMatchObject({ about: "yes", entity: "same", note: "협약 당사자" });
    expect(noted.judgedAt?.getTime()).toBe(T0.getTime());
    expect((await prisma.articleJudgment.findUniqueOrThrow({ where: { id: queued.id } })).judgedBy).toBe(user.id);
  });

  it("forgets when it was judged once the verdict is taken back", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1")]);
    const [queued] = await prisma.articleJudgment.findMany();
    await saveJudgment(queued.id, { about: "yes" }, user.id, T0);

    const cleared = await saveJudgment(queued.id, { about: null }, user.id, at(1));

    expect(cleared.about).toBeNull();
    expect(cleared.judgedAt).toBeNull();
  });

  it("turns verdicts into overrides — no excludes, yes includes, unsure and unjudged do nothing", async () => {
    const { company, user } = await seed();
    await enqueueJudgments(["https://n/no", "https://n/yes", "https://n/unsure", "https://n/open"].map((link) => row(company.id, link)));
    const rows = await prisma.articleJudgment.findMany({ orderBy: { id: "asc" } });
    await saveJudgment(rows[0].id, { about: "no" }, user.id, T0);
    await saveJudgment(rows[1].id, { about: "yes" }, user.id, T0);
    await saveJudgment(rows[2].id, { about: "unsure" }, user.id, T0);

    expect(await judgmentOverrides(company.id)).toEqual({ exclude: ["https://n/no"], include: ["https://n/yes"] });
  });

  it("lists a company for re-analysis when a verdict came after its last finished analysis", async () => {
    const { company, user } = await seed();
    await runAt(company.id, user.id, "completed", T0);
    await runAt(company.id, user.id, "collected", at(30));
    await runAt(company.id, user.id, "failed", at(40));
    await enqueueJudgments([row(company.id, "https://n/1")]);
    const [queued] = await prisma.articleJudgment.findMany();
    await saveJudgment(queued.id, { about: "no" }, user.id, at(10));

    expect(await listReflectPending()).toEqual([{ companyId: company.id, name: "누아", judged: 1 }]);
  });

  it("does not list a company whose last finished analysis already came after the verdict", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1")]);
    const [queued] = await prisma.articleJudgment.findMany();
    await saveJudgment(queued.id, { about: "yes" }, user.id, T0);
    await runAt(company.id, user.id, "no_news", at(10));

    expect(await listReflectPending()).toEqual([]);
  });

  it("lists a judged company that has never finished an analysis, but not for unsure verdicts", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1"), row(company.id, "https://n/2")]);
    const rows = await prisma.articleJudgment.findMany({ orderBy: { id: "asc" } });
    await saveJudgment(rows[0].id, { about: "unsure" }, user.id, T0);

    expect(await listReflectPending()).toEqual([]);

    await saveJudgment(rows[1].id, { about: "yes" }, user.id, T0);
    expect(await listReflectPending()).toEqual([{ companyId: company.id, name: "누아", judged: 1 }]);
  });

  it("leaves excluded companies out of the queue, the pending count and re-analysis", async () => {
    const { company, user } = await seed();
    const gone = await prisma.company.create({ data: { name: "제외", year: 2025, isActive: false } });
    await enqueueJudgments([row(company.id, "https://n/1"), row(gone.id, "https://n/2"), row(gone.id, "https://n/3")]);
    const goneRow = await prisma.articleJudgment.findFirstOrThrow({ where: { companyId: gone.id } });
    await saveJudgment(goneRow.id, { about: "no" }, user.id, T0);

    expect(await countPendingJudgments()).toBe(1);
    expect(await listReflectPending()).toEqual([]);
    expect((await listJudgments()).map((judgment) => judgment.companyId)).toEqual([company.id]);
  });

  it("puts required gate articles first, then the rest in the order they were queued", async () => {
    const { company } = await seed();
    await enqueueJudgments([row(company.id, "https://n/held")], T0);
    await enqueueJudgments([row(company.id, "https://n/optional", { origin: "gate", required: false })], at(1));
    await enqueueJudgments([row(company.id, "https://n/required", { origin: "gate", required: true, stratum: "A", setKey: "jev-gate-2026-09" })], at(2));

    const listed = await listJudgments();

    expect(listed.map((judgment) => judgment.link)).toEqual(["https://n/required", "https://n/held", "https://n/optional"]);
    expect(listed[0].company).toEqual({ name: "누아", officialName: "주식회사 누아", industry: "클라우드", ceoName: "서덕진", aliases: ["NUA"] });
  });

  it("finds a company's judgments by link for the article list", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([row(company.id, "https://n/1"), row(company.id, "https://n/2")]);
    const [first] = await prisma.articleJudgment.findMany({ orderBy: { id: "asc" } });
    await saveJudgment(first.id, { about: "yes" }, user.id, T0);

    const byLink = await findJudgmentsByLink(company.id);

    expect(byLink.get("https://n/1")).toEqual({ id: first.id, about: "yes" });
    expect(byLink.get("https://n/2")?.about).toBeNull();
  });

  it("reads the gate set's verdicts only", async () => {
    const { company, user } = await seed();
    await enqueueJudgments([
      row(company.id, "https://n/gate", { origin: "gate", setKey: "jev-gate-2026-09", stratum: "B", required: true }),
      row(company.id, "https://n/held"),
    ]);
    const gate = await prisma.articleJudgment.findFirstOrThrow({ where: { setKey: "jev-gate-2026-09" } });
    await saveJudgment(gate.id, { about: "yes" }, user.id, T0);

    expect(await listGateLabels("jev-gate-2026-09")).toEqual([{ companyId: company.id, link: "https://n/gate", about: "yes", stratum: "B" }]);
  });
});
