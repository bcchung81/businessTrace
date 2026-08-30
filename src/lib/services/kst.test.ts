import { describe, expect, it } from "vitest";
import { kstDate, kstMonthDay } from "@/lib/services/kst";

describe("kstDate", () => {
  it("rolls a UTC midnight crossing into the next KST day", () => {
    expect(kstDate("2026-08-31T15:30:00.000Z")).toBe("2026-09-01");
  });

  it("keeps the same day when KST doesn't cross midnight", () => {
    expect(kstDate("2026-08-26T09:00:00.000Z")).toBe("2026-08-26");
  });
});

describe("kstMonthDay", () => {
  it("rolls a UTC midnight crossing into the next KST day", () => {
    expect(kstMonthDay("2026-08-31T15:30:00.000Z")).toBe("09-01");
  });

  it("keeps the same day when KST doesn't cross midnight", () => {
    expect(kstMonthDay("2026-08-26T09:00:00.000Z")).toBe("08-26");
  });
});
