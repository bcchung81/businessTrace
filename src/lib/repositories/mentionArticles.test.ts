import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listMentionArticles } from "@/lib/repositories/mentionArticles";

const NEWS = [
  {
    title: "크립토랩과 옥타코 공동 과제",
    content: "두 회사가 협력한다.",
    link: "https://news.example.com/1",
    source: "전자신문",
    published: "2026-07-14",
  },
];

async function seedRun(options: { name: string; year: number; news: unknown; createdAt?: Date }) {
  const company = await prisma.company.create({ data: { name: options.name, year: options.year } });
  const user = await prisma.user.create({
    data: { email: `run-${company.id}@example.com`, passwordHash: "scrypt:32768:8:1$s$h" },
  });
  return prisma.analysisRun.create({
    data: {
      companyId: company.id,
      userId: user.id,
      model: "claude-sonnet-5",
      status: "completed",
      newsJson: typeof options.news === "string" ? options.news : JSON.stringify(options.news),
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
}

describe("listMentionArticles", () => {
  beforeEach(resetDatabase);

  it("returns one article per stored news item, tagged with the company it was collected for", async () => {
    await seedRun({ name: "크립토랩", year: 2026, news: NEWS });

    const articles = await listMentionArticles(2026);

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      subject: "크립토랩",
      title: "크립토랩과 옥타코 공동 과제",
      link: "https://news.example.com/1",
      source: "전자신문",
    });
  });

  it("leaves out runs from another evaluation year", async () => {
    await seedRun({ name: "크립토랩", year: 2026, news: NEWS });
    await seedRun({ name: "지난해기업", year: 2025, news: NEWS });

    expect(await listMentionArticles(2026)).toHaveLength(1);
  });

  it("counts only the newest run per company so a re-run does not double every mention", async () => {
    const company = await prisma.company.create({ data: { name: "크립토랩", year: 2026 } });
    const user = await prisma.user.create({
      data: { email: "twice@example.com", passwordHash: "scrypt:32768:8:1$s$h" },
    });
    const base = { companyId: company.id, userId: user.id, model: "m", status: "completed" };
    await prisma.analysisRun.create({
      data: { ...base, newsJson: JSON.stringify(NEWS), createdAt: new Date("2026-08-01") },
    });
    await prisma.analysisRun.create({
      data: { ...base, newsJson: JSON.stringify(NEWS), createdAt: new Date("2026-08-20") },
    });

    expect(await listMentionArticles(2026)).toHaveLength(1);
  });

  it("skips a run whose stored news cannot be read instead of failing the whole screen", async () => {
    await seedRun({ name: "깨진기업", year: 2026, news: "not json" });
    await seedRun({ name: "크립토랩", year: 2026, news: NEWS });

    expect(await listMentionArticles(2026)).toHaveLength(1);
  });

  it("returns nothing when no analysis has been run", async () => {
    expect(await listMentionArticles(2026)).toEqual([]);
  });
});
