import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";
import { createSubmission, listSubmissions } from "@/lib/repositories/submission";

describe("submission repository", () => {
  beforeEach(resetDatabase);

  it("records a submission with its hash and lists newest first", async () => {
    await createSubmission({ filename: "8월 제출.xlsx", storedPath: "data/submissions/1.xlsx", sha256: "ab".repeat(32), size: 1024, note: null, userId: 1 });
    const second = await createSubmission({ filename: "9월 제출.xlsx", storedPath: "data/submissions/2.xlsx", sha256: "cd".repeat(32), size: 2048, note: "수정본", userId: 1 });

    const rows = await listSubmissions();
    expect(rows.map((row) => row.filename)).toEqual(["9월 제출.xlsx", "8월 제출.xlsx"]);
    expect(rows[0]).toMatchObject({ id: second.id, sha256: "cd".repeat(32), size: 2048, note: "수정본", submittedBy: 1 });
    expect(typeof rows[0].submittedAt).toBe("string");
  });
});
