import { describe, expect, it } from "vitest";
import { formatRunTime } from "@/lib/services/formatRunTime";

describe("formatRunTime", () => {
  it("renders the UTC timestamp as Asia/Seoul wall-clock time", () => {
    expect(formatRunTime("2026-08-28T13:19:00.000Z")).toBe("08-28 22:19");
  });

  it("rolls over to the next day when KST crosses midnight", () => {
    expect(formatRunTime("2026-08-28T15:00:00.000Z")).toBe("08-29 00:00");
  });

  it("prints a dash when there is no run yet", () => {
    expect(formatRunTime(null)).toBe("—");
  });
});
