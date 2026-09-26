import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { enqueueJudgments } from "@/lib/repositories/articleJudgment";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { queueArticleAction, saveJudgmentAction } from "@/app/(app)/judgments/actions";

async function queuedJudgment() {
  const company = await prisma.company.create({ data: { name: "누아", year: 2025 } });
  await enqueueJudgments([
    { companyId: company.id, link: "https://n/1", title: "제목", source: "전자신문", published: "2026-09-20", body: "본문", origin: "held", model: { analyzer: "llm", runId: 312, isAbout: false, held: true, confidence: 0.45 } },
  ]);
  const judgment = await prisma.articleJudgment.findFirstOrThrow();
  return { company, judgment };
}

async function runWithArticle(companyId: number) {
  const user = await prisma.user.create({ data: { email: `q-${companyId}@example.com`, passwordHash: "x" } });
  const analysis = {
    news: { title: "누아 클라우드 출시", link: "https://n/a", description: "", content: "누아가 클라우드를 냈다.", published: "2026-09-21", source: "지디넷", provider: "naver", titleMatch: true, mentions: 2, relevance: "primary" },
    isAboutCompany: true,
    trend: { is_about_company: "Y", about_confidence: 0.92, news_trend_summary: "요약", sentiment_score: 4, sentiment_label: "긍정적", negative_kind: "none", growth_signals: [] },
    award: { is_award_related: "N", award_name: "", award_reason: "" },
    investment: { is_investment_related: "N", investment_name: "", investment_reason: "", investment_round: "none", investment_amount_krw: null },
  };
  return prisma.analysisRun.create({
    data: { companyId, userId: user.id, model: "m", status: "completed", newsJson: "[]", resultJson: JSON.stringify({ companyName: "누아", analyses: [analysis] }) },
  });
}

describe("judgment actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "7" } } as never);
  });

  test("refuse anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    expect(await saveJudgmentAction({ id: 1, about: "yes" })).toEqual({ ok: false, message: "unauthorized" });
    expect(await queueArticleAction({ companyId: 1, runId: 1, link: "https://n/a" })).toEqual({ ok: false, message: "unauthorized" });
  });

  test("reject an answer the questions do not offer", async () => {
    const { judgment } = await queuedJudgment();

    const saved = await saveJudgmentAction({ id: judgment.id, about: "maybe" });

    expect(saved.ok).toBe(false);
    expect((await prisma.articleJudgment.findUniqueOrThrow({ where: { id: judgment.id } })).about).toBeNull();
  });

  test("keep the analyzer's answer hidden until the verdict is saved, then reveal it", async () => {
    const { judgment } = await queuedJudgment();

    const partial = await saveJudgmentAction({ id: judgment.id, entity: "same" });
    const decided = await saveJudgmentAction({ id: judgment.id, about: "no" });

    expect(partial).toMatchObject({ ok: true, judgment: { judged: false, verdict: null, answer: { entity: "same", about: null } } });
    expect(decided).toMatchObject({ ok: true, judgment: { judged: true, verdict: "분석기: 보류 · 확신 0.45 · LLM · 실행 #312", answer: { entity: "same", about: "no" } } });
  });

  test("do not re-render the whole queue on every save — the answer already carries the saved row", async () => {
    const { company, judgment } = await queuedJudgment();
    vi.mocked(revalidatePath).mockClear();

    await saveJudgmentAction({ id: judgment.id, note: "메모" });

    expect(revalidatePath).not.toHaveBeenCalledWith("/judgments");
    expect(revalidatePath).toHaveBeenCalledWith(`/companies/${company.id}`);
  });

  test("say so when the judgment is gone", async () => {
    expect(await saveJudgmentAction({ id: 9999, about: "yes" })).toEqual({ ok: false, message: "판정할 기사를 찾지 못했습니다." });
  });

  test("queue an article from a run's analysis once, with a snapshot and what the analyzer said", async () => {
    const company = await prisma.company.create({ data: { name: "누아", year: 2025 } });
    const run = await runWithArticle(company.id);

    const first = await queueArticleAction({ companyId: company.id, runId: run.id, link: "https://n/a" });
    const again = await queueArticleAction({ companyId: company.id, runId: run.id, link: "https://n/a" });

    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    const stored = await prisma.articleJudgment.findFirstOrThrow();
    expect(stored).toMatchObject({ origin: "manual", title: "누아 클라우드 출시", body: "누아가 클라우드를 냈다.", source: "지디넷" });
    expect(JSON.parse(stored.modelJson)).toMatchObject({ analyzer: "llm", runId: run.id, isAbout: true, confidence: 0.92 });
  });

  test("refuse a run or link that does not exist, or a run of another company", async () => {
    const company = await prisma.company.create({ data: { name: "누아", year: 2025 } });
    const other = await prisma.company.create({ data: { name: "페어리", year: 2024 } });
    const run = await runWithArticle(company.id);

    expect((await queueArticleAction({ companyId: company.id, runId: 9999, link: "https://n/a" })).ok).toBe(false);
    expect((await queueArticleAction({ companyId: company.id, runId: run.id, link: "https://n/none" })).ok).toBe(false);
    expect((await queueArticleAction({ companyId: other.id, runId: run.id, link: "https://n/a" })).ok).toBe(false);
    expect(await prisma.articleJudgment.count()).toBe(0);
  });
});
