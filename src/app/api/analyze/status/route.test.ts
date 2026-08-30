import { beforeEach, describe, expect, test, vi } from "vitest";
import { finishBatch, startBatch } from "@/lib/services/batchRegistry";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "1" } })) }));
import { GET } from "@/app/api/analyze/status/route";

describe("GET /api/analyze/status", () => {
  beforeEach(finishBatch);

  test("reports null when idle and the running batch otherwise", async () => {
    expect(await (await GET()).json()).toEqual({ batch: null });
    startBatch({ stage: "full", total: 4 });
    expect(await (await GET()).json()).toMatchObject({ batch: { stage: "full", total: 4, done: 0 } });
  });
});
