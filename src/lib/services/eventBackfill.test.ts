import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listEvents } from "@/lib/repositories/eventRepository";
import { savePensionSeries } from "@/lib/repositories/pensionSnapshot";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";
import { backfillEvents } from "@/lib/services/eventBackfill";

describe("backfillEvents", () => {
  beforeEach(resetDatabase);

  it("extracts pension and source events for every active company and is idempotent", async () => {
    const company = await prisma.company.create({ data: { name: "알체라", year: 2025 } });
    await savePensionSeries(company.id, { months: [{ ym: "202606", subscribers: 63, noticeAmount: null, hired: null, departed: null }, { ym: "202607", subscribers: 41, noticeAmount: null, hired: null, departed: null }] });
    await saveSourceSnapshots(company.id, [{ source: "nts", status: "found", summary: "폐업 · 2026-07-01", payload: {} }]);

    const first = await backfillEvents(2025, new Date("2026-08-30"));
    const second = await backfillEvents(2025, new Date("2026-08-30"));

    expect(first).toEqual({ analysis: 0, pension: 1, source: 1 });
    expect(second).toEqual({ analysis: 0, pension: 0, source: 0 });
    expect((await listEvents({ year: 2025 })).map((e) => e.kind).sort()).toEqual(["closure", "headcount_down"]);
  });
});
