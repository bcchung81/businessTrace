import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listSourceDecisions } from "@/lib/repositories/sourceDecision";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/refreshSources", () => ({ refreshSourcesFor: vi.fn(async () => ({})) }));
import { auth } from "@/auth";
import { refreshSourcesFor } from "@/lib/services/refreshSources";
import {
  confirmEventsAction,
  decideDartAction,
  decideNpsAction,
  holdNpsAction,
  reviewVerificationAction,
  saveAliasesAction,
  saveBusinessNoAction,
} from "@/app/companies/[id]/actions";

describe("company review actions", () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(auth).mockResolvedValue({ user: { id: "7" } } as never);
    vi.mocked(refreshSourcesFor).mockClear();
  });

  test("refuse anonymous callers", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect(await decideNpsAction({ companyId: 1, prefix: "625870", label: "x" })).toEqual({ ok: false, message: "unauthorized" });
  });

  test("an NPS decision is saved and the sources are re-checked; hold clears it", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await decideNpsAction({ companyId: c.id, prefix: "625870", label: "㈜가 · 서울" })).toEqual({ ok: true });
    expect(await listSourceDecisions(c.id)).toMatchObject([{ source: "nps", value: "625870", label: "㈜가 · 서울" }]);
    expect(refreshSourcesFor).toHaveBeenCalledWith(c.id);
    expect(await holdNpsAction({ companyId: c.id })).toEqual({ ok: true });
    expect(await listSourceDecisions(c.id)).toEqual([]);
  });

  test("a DART 'none' decision is saved and re-checked", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await decideDartAction({ companyId: c.id, corpCode: "none" })).toEqual({ ok: true });
    expect(await listSourceDecisions(c.id)).toMatchObject([{ source: "dart", value: "none" }]);
    expect(refreshSourcesFor).toHaveBeenCalledTimes(1);
  });

  test("a verification review stamps who, when and the note", async () => {
    const user = await prisma.user.create({ data: { email: "a@example.com", passwordHash: "x" } });
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const run = await prisma.analysisRun.create({ data: { companyId: c.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" } });
    await prisma.verificationResult.create({ data: { analysisRunId: run.id, status: "needs_review", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" } });
    expect(await reviewVerificationAction({ runId: run.id, note: "흑자 전환은 원문에 없음" })).toEqual({ ok: true });
    const stored = await prisma.verificationResult.findUniqueOrThrow({ where: { analysisRunId: run.id } });
    expect(stored.reviewedBy).toBe(7);
    expect(stored.reviewedAt).toBeInstanceOf(Date);
    expect(stored.reviewNote).toBe("흑자 전환은 원문에 없음");
  });

  test("confirming events acknowledges each one", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const base = { companyId: c.id, occurredAt: new Date(), title: "t", evidenceJson: "[]", severity: "alert", kind: "closure" };
    const a = await prisma.event.create({ data: { ...base, evidenceKey: "1" } });
    const b = await prisma.event.create({ data: { ...base, evidenceKey: "2" } });
    expect(await confirmEventsAction({ companyId: c.id, eventIds: [a.id, b.id], action: "acknowledge" })).toEqual({ ok: true });
    const rows = await prisma.event.findMany({ where: { companyId: c.id } });
    expect(rows.map((r) => r.status)).toEqual(["acknowledged", "acknowledged"]);
    expect(rows.every((r) => r.reviewedBy === 7)).toBe(true);
  });

  test("aliases are trimmed, de-duplicated and stored as JSON", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await saveAliasesAction({ companyId: c.id, aliases: [" 가테크 ", "가테크", "", "Ga Tech"] })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).aliases).toBe('["가테크","Ga Tech"]');
  });

  test("a business number is normalised to ten digits and triggers a source refresh; short input is refused", async () => {
    const c = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    expect(await saveBusinessNoAction({ companyId: c.id, businessNo: "123-45-67890" })).toEqual({ ok: true });
    expect((await prisma.company.findUniqueOrThrow({ where: { id: c.id } })).businessNo).toBe("1234567890");
    expect(refreshSourcesFor).toHaveBeenCalledWith(c.id);
    expect(await saveBusinessNoAction({ companyId: c.id, businessNo: "123456789" })).toMatchObject({ ok: false });
  });
});
