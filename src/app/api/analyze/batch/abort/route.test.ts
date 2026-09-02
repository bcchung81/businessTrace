import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishBatch, readBatch, startBatch } from "@/lib/services/batchRegistry";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "1" } })) }));
import { auth } from "@/auth";
import { POST } from "@/app/api/analyze/batch/abort/route";

describe("POST /api/analyze/batch/abort", () => {
  beforeEach(finishBatch);

  test("401 anonymous", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await POST()).status).toBe(401);
  });

  test("flags the running batch and reports nothing to stop when idle", async () => {
    expect(await (await POST()).json()).toEqual({ aborting: false });
    startBatch({ stage: "full", total: 2 });
    expect(await (await POST()).json()).toEqual({ aborting: true });
    expect(readBatch()).toMatchObject({ aborting: true });
  });
});
