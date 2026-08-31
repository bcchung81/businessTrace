import { beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { saveSourceDecision } from "@/lib/repositories/sourceDecision";
import { buildReviewItems } from "@/lib/repositories/reviewItems";

async function company(over: Record<string, unknown> = {}) {
  return prisma.company.create({ data: { name: "㈜가", year: 2026, businessNo: "6258700001", ...over } });
}

describe("buildReviewItems", () => {
  beforeEach(resetDatabase);

  test("lists an NPS conflict with the registry-matching candidate flagged, until a decision is saved", async () => {
    const c = await company();
    await prisma.sourceSnapshot.create({
      data: {
        companyId: c.id, source: "nps", status: "conflict", summary: "후보 2건",
        payload: JSON.stringify({ candidates: [{ companyName: "㈜가", businessNoPrefix: "625870", address: "서울" }, { companyName: "가", businessNoPrefix: "111111", address: null }] }),
      },
    });
    const before = (await buildReviewItems(c.id))!;
    expect(before.items).toContainEqual({
      kind: "nps_conflict",
      chosen: null,
      candidates: [
        { prefix: "625870", name: "㈜가", address: "서울", registryMatch: true },
        { prefix: "111111", name: "가", address: null, registryMatch: false },
      ],
    });
    await saveSourceDecision({ companyId: c.id, source: "nps", value: "625870", userId: 1 });
    expect((await buildReviewItems(c.id))!.items.find((i) => i.kind === "nps_conflict")).toBeUndefined();
  });

  test("lists a single DART candidate, open alert/notice events, an unreviewed verification and no-news", async () => {
    const user = await prisma.user.create({ data: { email: "r@example.com", passwordHash: "x" } });
    const c = await company({ aliases: '["가 테크"]' });
    await prisma.sourceSnapshot.create({
      data: { companyId: c.id, source: "dart", status: "conflict", summary: "후보 1건", payload: JSON.stringify({ candidates: [{ corpCode: "00123", corpName: "주식회사 가", stockCode: null }] }) },
    });
    const base = { companyId: c.id, occurredAt: new Date("2026-08-20"), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, kind: "closure", severity: "alert", status: "open", evidenceKey: "1" } });
    await prisma.event.create({ data: { ...base, kind: "award", severity: "positive", status: "open", evidenceKey: "2" } });
    await prisma.event.create({ data: { ...base, kind: "headcount_down", severity: "notice", status: "done", evidenceKey: "3" } });
    const run = await prisma.analysisRun.create({
      data: { companyId: c.id, userId: user.id, model: "m", status: "no_news", newsJson: "[]", resultJson: JSON.stringify({ stats: { scoredNews: 0 } }), completedAt: new Date() },
    });
    await prisma.verificationResult.create({
      data: { analysisRunId: run.id, status: "needs_review", faithfulness: 0.5, sourceCoverage: 1, evidenceMatch: 0.7, unsupportedClaims: "[]", counterEvidence: '["보도자료 의존"]', detailJson: "{}" },
    });
    const summary = (await buildReviewItems(c.id))!;
    expect(summary.items.map((i) => i.kind)).toEqual(["dart_conflict", "verification", "open_events", "no_news"]);
    expect(summary.items[0]).toMatchObject({ candidate: { corpCode: "00123", corpName: "주식회사 가" } });
    expect(summary.items[1]).toMatchObject({ runId: run.id, failed: ["근거 충실도"], counterEvidence: ["보도자료 의존"] });
    expect((summary.items[2] as { events: unknown[] }).events).toHaveLength(1);
    expect(summary.items[3]).toEqual({ kind: "no_news", aliases: ["가 테크"] });
  });

  test("keeps namesake-conflict events out of the open-events ask — the decision item is the ask", async () => {
    const c = await company();
    const base = { companyId: c.id, occurredAt: new Date("2026-08-20"), title: "t", evidenceJson: "[]" };
    await prisma.event.create({ data: { ...base, kind: "source_conflict", severity: "notice", status: "open", evidenceKey: "fsc:conflict" } });
    await prisma.event.create({ data: { ...base, kind: "closure", severity: "alert", status: "open", evidenceKey: "nts:폐업" } });

    const summary = (await buildReviewItems(c.id))!;
    const open = summary.items.find((i) => i.kind === "open_events") as { events: Array<{ kind: string }> };

    expect(open.events.map((e) => e.kind)).toEqual(["closure"]);
  });

  test("lists an fsc number mismatch until the operator decides it", async () => {
    const c = await company();
    await prisma.sourceSnapshot.create({
      data: {
        companyId: c.id, source: "fsc", status: "conflict", summary: "사업자번호 불일치 · 확보 6258700001 ↔ 금융위 2068117321",
        payload: JSON.stringify({ found: true, corpName: "주식회사 가온", businessNo: "2068117321" }),
      },
    });

    const before = (await buildReviewItems(c.id))!;
    expect(before.items).toContainEqual({ kind: "fsc_conflict", registryNo: "6258700001", fscNo: "2068117321", corpName: "주식회사 가온" });

    await saveSourceDecision({ companyId: c.id, source: "fsc", value: "none", userId: 1 });
    expect((await buildReviewItems(c.id))!.items.find((i) => i.kind === "fsc_conflict")).toBeUndefined();
  });

  test("a later news-only collection run does not hide an unreviewed verification", async () => {
    const user = await prisma.user.create({ data: { email: "c@example.com", passwordHash: "x" } });
    const c = await company();
    const analysed = await prisma.analysisRun.create({
      data: { companyId: c.id, userId: user.id, model: "m", status: "completed", newsJson: "[]", createdAt: new Date("2026-08-01"), completedAt: new Date("2026-08-01") },
    });
    await prisma.verificationResult.create({
      data: { analysisRunId: analysed.id, status: "needs_review", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" },
    });
    await prisma.analysisRun.create({
      data: { companyId: c.id, userId: user.id, model: "m", status: "collected", newsJson: "[]", createdAt: new Date("2026-08-20") },
    });

    const summary = (await buildReviewItems(c.id))!;

    expect(summary.items.map((i) => i.kind)).toContain("verification");
  });

  test("flags a missing business number with the NPS prefix pre-filled, and returns nothing to review when clean", async () => {
    const c = await company({ businessNo: null });
    await prisma.sourceSnapshot.create({ data: { companyId: c.id, source: "nps", status: "found", summary: "가입자 8명", payload: JSON.stringify({ businessNoPrefix: "625870" }) } });
    expect((await buildReviewItems(c.id))!.items).toEqual([{ kind: "no_business_no", npsPrefix: "625870" }]);
    const clean = await company({ name: "㈜나" });
    expect((await buildReviewItems(clean.id))!.items).toEqual([]);
    expect(await buildReviewItems(999)).toBeNull();
  });
});
