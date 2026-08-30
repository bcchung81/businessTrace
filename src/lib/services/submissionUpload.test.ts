import { describe, expect, it } from "vitest";
import { hashAndName, MAX_SUBMISSION_BYTES } from "@/lib/services/submissionUpload";

describe("hashAndName", () => {
  it("hashes the content and builds a collision-safe stored name", () => {
    const { sha256, storedName } = hashAndName(Buffer.from("hello"), "8월 제출(최종).xlsx");

    expect(sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(storedName).toBe("2cf24dba5fb0-8월 제출(최종).xlsx");
  });

  it("strips path separators from the filename", () => {
    const { storedName } = hashAndName(Buffer.from("x"), "../etc/passwd");

    expect(storedName.includes("/")).toBe(false);
    expect(storedName.includes("\\")).toBe(false);
  });

  it("keeps the size limit at 20MB", () => {
    expect(MAX_SUBMISSION_BYTES).toBe(20 * 1024 * 1024);
  });
});
