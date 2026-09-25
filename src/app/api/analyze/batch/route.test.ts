import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { closeBatchStream, finishBatch, readBatch, startBatch, subscribeBatch } from "@/lib/services/batchRegistry";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/services/analysisPipeline", () => ({ defaultPipelineDeps: () => ({ model: "m", analyze: vi.fn(), verify: vi.fn() }) }));
vi.mock("@/lib/services/batchRun", () => ({
  runBatch: vi.fn(async function* (targets: Array<{ id: number }>) {
    startBatch({ stage: "full", total: targets.length });
    try {
      yield { type: "batch_start", total: targets.length, stage: "full" };
      for (const target of targets) yield { type: "company_done", companyId: target.id, status: "skipped", message: "이미 검증됨" };
      yield { type: "batch_done", done: targets.length, total: targets.length, aborted: false };
    } finally {
      finishBatch();
    }
  }),
}));
import { auth } from "@/auth";
import { runBatch } from "@/lib/services/batchRun";
import { POST } from "@/app/api/analyze/batch/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/analyze/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const settle = () => vi.waitFor(() => expect(readBatch()).toBeNull());

const published = () => {
  const seen: unknown[] = [];
  subscribeBatch((event) => seen.push(event));
  return JSON.stringify(seen);
};

describe("POST /api/analyze/batch", () => {
  beforeEach(async () => {
    await resetDatabase();
    finishBatch();
    closeBatchStream();
    vi.mocked(auth).mockResolvedValue({ user: { id: "1" } } as never);
  });

  test("401 anonymous, 400 bad body, 409 while a batch runs", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await post({ companyIds: [1] })).status).toBe(401);
    expect((await post({ companyIds: [] })).status).toBe(400);
    startBatch({ stage: "news", total: 2 });
    const busy = await post({ companyIds: [1], stage: "full", limit: 20, force: false, naver: true, google: true });
    expect(busy.status).toBe(409);
    expect((await busy.json()).message).toContain("2개사");
  });

  test("409 while a scheduled job holds the batch lock — the web run and the nightly run must not overlap", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    await prisma.jobLock.create({ data: { name: "batch", holder: "scheduled:9", expiresAt: new Date(Date.now() + 60_000) } });
    const runsBefore = vi.mocked(runBatch).mock.calls.length;

    const busy = await post({ companyIds: [a.id], stage: "full", limit: 20, force: false, naver: true, google: true });

    expect(busy.status).toBe(409);
    expect((await busy.json()).message).toContain("정기 작업");
    expect(vi.mocked(runBatch).mock.calls).toHaveLength(runsBefore);
  });

  test("holds the batch lock while running and lets go when the run ends", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    let holderDuringRun: string | null = null;
    vi.mocked(runBatch).mockImplementationOnce(async function* () {
      startBatch({ stage: "full", total: 1 });
      try {
        yield { type: "batch_start", total: 1, stage: "full" };
        holderDuringRun = (await prisma.jobLock.findUnique({ where: { name: "batch" } }))?.holder ?? null;
        yield { type: "batch_done", done: 1, total: 1, aborted: false };
      } finally {
        finishBatch();
      }
    });

    await post({ companyIds: [a.id], stage: "full", limit: 20, force: false, naver: true, google: true });
    await settle();

    expect(holderDuringRun).toMatch(/^web:/);

    await vi.waitFor(async () => expect(await prisma.jobLock.count()).toBe(0));
  });

  test("lets go of the lock when there is nothing to run", async () => {
    const b = await prisma.company.create({ data: { name: "㈜나", year: 2026, isActive: false } });

    expect((await post({ companyIds: [b.id] })).status).toBe(400);
    expect(await prisma.jobLock.count()).toBe(0);
  });

  test("marks a company verified only when its verification actually passed", async () => {
    const user = await prisma.user.create({ data: { email: "b@example.com", passwordHash: "x" } });
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const run = await prisma.analysisRun.create({
      data: { companyId: a.id, userId: user.id, model: "m", status: "completed", newsJson: "[]" },
    });
    await prisma.verificationResult.create({
      data: { analysisRunId: run.id, status: "needs_review", unsupportedClaims: "[]", counterEvidence: "[]", detailJson: "{}" },
    });

    await post({ companyIds: [a.id], stage: "full", limit: 20, force: false, naver: true, google: true });
    await settle();

    expect(vi.mocked(runBatch).mock.calls.at(-1)![0][0]).toMatchObject({ id: a.id, verified: false });
  });

  test("runs two companies at a time unless the request says otherwise", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    await post({ companyIds: [a.id], stage: "full", limit: 20, force: false, naver: true, google: true });
    await settle();
    expect(vi.mocked(runBatch).mock.calls.at(-1)![1]).toMatchObject({ concurrency: 2 });

    await post({ companyIds: [a.id], stage: "full", limit: 20, force: false, naver: true, google: true, concurrency: 1 });
    await settle();
    expect(vi.mocked(runBatch).mock.calls.at(-1)![1]).toMatchObject({ concurrency: 1 });
  });

  test("accepts with 202 and runs the batch in the background, publishing its events", async () => {
    const a = await prisma.company.create({ data: { name: "㈜가", year: 2026 } });
    const b = await prisma.company.create({ data: { name: "㈜나", year: 2026, isActive: false } });
    const response = await post({ companyIds: [a.id, b.id, 999], stage: "full", limit: 20, force: false, naver: true, google: true });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ batch: { stage: "full", total: 1, done: 0, aborting: false } });
    await settle();

    const text = published();
    expect(text).toContain('"type":"batch_start"');
    expect(text).toContain(`"companyId":${a.id}`);
    expect(text).not.toContain(`"companyId":${b.id}`);
    expect(vi.mocked(runBatch).mock.calls[0][0]).toHaveLength(1);
  });
});
