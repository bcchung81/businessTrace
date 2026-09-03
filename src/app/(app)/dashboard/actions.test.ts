import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { auth } from "@/auth";
import { confirmCompanyEventsAction, loadReviewItemsAction, markVerificationsReviewedAction } from "@/app/(app)/dashboard/actions";

async function seedUser() {
  return prisma.user.create({ data: { email: "admin@example.com", passwordHash: "hash" } });
}

async function seedEvent(companyId: number, severity: string, status: string, key: string, kind = "closure") {
  return prisma.event.create({
    data: { companyId, kind, severity, status, occurredAt: new Date("2026-08-20T00:00:00.000Z"), title: `${key} 사건`, evidenceKey: key, evidenceJson: "[]" },
  });
}

async function seedRun(companyId: number, userId: number, createdAt: string, verification: { status: string; reviewedAt?: Date } | null) {
  const run = await prisma.analysisRun.create({
    data: { companyId, userId, model: "claude-sonnet-5", newsJson: "[]", status: "completed", createdAt: new Date(createdAt) },
  });
  if (verification) {
    await prisma.verificationResult.create({
      data: { analysisRunId: run.id, status: verification.status, unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}", reviewedAt: verification.reviewedAt ?? null },
    });
  }
  return run;
}

describe("dashboard todo actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "7" } } as never);
  });

  test("refuse anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await loadReviewItemsAction(1)).toEqual({ ok: false, message: "unauthorized" });
    expect(await confirmCompanyEventsAction([1])).toEqual({ ok: false, message: "unauthorized" });
    expect(await markVerificationsReviewedAction([1])).toEqual({ ok: false, message: "unauthorized" });
  });

  test("loads one company's review items and gives null for a company that is gone", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    await seedEvent(company.id, "alert", "open", "a1");

    const result = await loadReviewItemsAction(company.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("불러오기가 실패했다");
    expect(result.summary?.items.map((item) => item.kind)).toContain("open_events");
    expect(await loadReviewItemsAction(9999)).toEqual({ ok: true, summary: null });
  });

  test("confirms only the open alert·notice events and counts what it actually changed", async () => {
    const first = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const second = await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const outsider = await prisma.company.create({ data: { name: "㈜다", year: 2026 } });
    const open = await seedEvent(first.id, "alert", "open", "a1");
    const already = await seedEvent(first.id, "notice", "acknowledged", "a2");
    const info = await seedEvent(first.id, "info", "open", "a3");
    const other = await seedEvent(second.id, "notice", "open", "b1");
    const untouched = await seedEvent(outsider.id, "alert", "open", "c1");

    expect(await confirmCompanyEventsAction([first.id, second.id])).toEqual({ ok: true, done: 2 });

    const rows = await prisma.event.findMany({ orderBy: { id: "asc" } });
    const status = (id: number) => rows.find((row) => row.id === id)?.status;
    expect(status(open.id)).toBe("acknowledged");
    expect(status(other.id)).toBe("acknowledged");
    expect(status(already.id)).toBe("acknowledged");
    expect(status(info.id)).toBe("open");
    expect(status(untouched.id)).toBe("open");
    expect(rows.find((row) => row.id === open.id)?.reviewedBy).toBe(7);
  });

  test("leaves namesake-conflict events alone — acknowledging one drops it from the automatic cleanup", async () => {
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const conflict = await seedEvent(company.id, "alert", "open", "s1", "source_conflict");
    const ordinary = await seedEvent(company.id, "alert", "open", "s2");

    expect(await confirmCompanyEventsAction([company.id])).toEqual({ ok: true, done: 1 });

    expect((await prisma.event.findUniqueOrThrow({ where: { id: conflict.id } })).status).toBe("open");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ordinary.id } })).status).toBe("acknowledged");
  });

  test("marks the latest run's unreviewed verification and leaves the bulk note", async () => {
    const user = await seedUser();
    const first = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const verified = await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const done = await prisma.company.create({ data: { name: "㈜다", year: 2026 } });
    const older = await seedRun(first.id, user.id, "2026-08-01T00:00:00.000Z", { status: "needs_review" });
    const latest = await seedRun(first.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review" });
    const passed = await seedRun(verified.id, user.id, "2026-08-20T00:00:00.000Z", { status: "verified" });
    const settled = await seedRun(done.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review", reviewedAt: new Date("2026-08-21T00:00:00.000Z") });

    expect(await markVerificationsReviewedAction([first.id, verified.id, done.id])).toEqual({ ok: true, done: 1 });

    const stored = await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: latest.id } });
    expect(stored).toMatchObject({ reviewedBy: 7, reviewNote: "일괄 검토 완료 · 근거 미열람" });
    expect(stored.reviewedAt).not.toBeNull();
    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: older.id } })).reviewedAt).toBeNull();
    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: passed.id } })).reviewedAt).toBeNull();
    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: settled.id } })).reviewNote).toBeNull();
  });

  test("ties on the creation time are broken by the larger id, as the detail screen does", async () => {
    const user = await seedUser();
    const company = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const first = await seedRun(company.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review" });
    const second = await seedRun(company.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review" });
    expect(second.id).toBeGreaterThan(first.id);

    expect(await markVerificationsReviewedAction([company.id])).toEqual({ ok: true, done: 1 });

    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: second.id } })).reviewNote).toBe("일괄 검토 완료 · 근거 미열람");
    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: first.id } })).reviewedAt).toBeNull();
    const summary = await loadReviewItemsAction(company.id);
    expect(summary.ok && summary.summary?.items.some((item) => item.kind === "verification")).toBe(false);
  });

  test("the note says whether the evidence was actually opened", async () => {
    const user = await seedUser();
    const opened = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const skimmed = await prisma.company.create({ data: { name: "㈜나", year: 2026 } });
    const read = await seedRun(opened.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review" });
    const unread = await seedRun(skimmed.id, user.id, "2026-08-20T00:00:00.000Z", { status: "needs_review" });

    expect(await markVerificationsReviewedAction([opened.id, skimmed.id], [opened.id])).toEqual({ ok: true, done: 2 });

    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: read.id } })).reviewNote).toBe("일괄 검토 완료 · 근거 열람");
    expect((await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: unread.id } })).reviewNote).toBe("일괄 검토 완료 · 근거 미열람");
  });

  test("an empty selection settles nothing", async () => {
    expect(await confirmCompanyEventsAction([])).toEqual({ ok: true, done: 0 });
    expect(await markVerificationsReviewedAction([])).toEqual({ ok: true, done: 0 });
  });
});
