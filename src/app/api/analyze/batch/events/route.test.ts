import { beforeEach, describe, expect, test, vi } from "vitest";
import { closeBatchStream, finishBatch, publishBatchEvent, startBatch } from "@/lib/services/batchRegistry";

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "1" } })) }));
import { auth } from "@/auth";
import { GET } from "@/app/api/analyze/batch/events/route";

describe("GET /api/analyze/batch/events", () => {
  beforeEach(() => {
    finishBatch();
    closeBatchStream();
  });

  test("401 anonymous", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await GET()).status).toBe(401);
  });

  test("replays the buffered events as SSE and ends when the batch stream closes", async () => {
    startBatch({ stage: "full", total: 1 });
    publishBatchEvent({ type: "batch_start", total: 1, stage: "full" });
    const response = await GET();
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    publishBatchEvent({ type: "batch_done", done: 1, total: 1, aborted: false });
    finishBatch();
    closeBatchStream();

    const text = await response.text();
    expect(text).toContain('data: {"type":"batch_start","total":1,"stage":"full"}');
    expect(text).toContain('"type":"batch_done"');
  });
});
