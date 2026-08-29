import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import {
  listSourceSnapshots,
  saveSourceSnapshots,
  summariseSourceCoverage,
} from "@/lib/repositories/sourceSnapshot";
import type { SnapshotRow } from "@/lib/services/sourceEvidence";

const DART: SnapshotRow = {
  source: "dart",
  status: "absent",
  summary: "DART 에 등록되지 않은 기업",
  payload: { found: false },
};

const NPS: SnapshotRow = {
  source: "nps",
  status: "found",
  summary: "가입자 61명 · 625870",
  payload: { found: true, subscribers: 61 },
};

async function seedCompany(name = "크립토랩") {
  return prisma.company.create({ data: { name, year: 2026 } });
}

describe("saveSourceSnapshots", () => {
  beforeEach(resetDatabase);

  it("stores one row per source", async () => {
    const company = await seedCompany();

    await saveSourceSnapshots(company.id, [DART, NPS]);

    expect(await prisma.sourceSnapshot.count()).toBe(2);
  });

  it("replaces the earlier row for the same source instead of stacking history", async () => {
    const company = await seedCompany();

    await saveSourceSnapshots(company.id, [DART]);
    await saveSourceSnapshots(company.id, [{ ...DART, status: "found", summary: "기업개황 조회됨" }]);

    const rows = await prisma.sourceSnapshot.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "found", summary: "기업개황 조회됨" });
  });
});

describe("listSourceSnapshots", () => {
  beforeEach(resetDatabase);

  it("returns the payload as an object, not as the stored string", async () => {
    const company = await seedCompany();
    await saveSourceSnapshots(company.id, [NPS]);

    const [row] = await listSourceSnapshots(company.id);

    expect(row.payload).toEqual({ found: true, subscribers: 61 });
    expect(row.fetchedAt).toBeInstanceOf(Date);
  });

  it("orders the sources the way the evidence screen reads them", async () => {
    const company = await seedCompany();
    await saveSourceSnapshots(company.id, [NPS, DART]);

    const rows = await listSourceSnapshots(company.id);

    expect(rows.map((row) => row.source)).toEqual(["dart", "nps"]);
  });

  it("returns nothing for a company that was never looked up", async () => {
    const company = await seedCompany("넷록스");

    expect(await listSourceSnapshots(company.id)).toEqual([]);
  });
});

describe("summariseSourceCoverage", () => {
  beforeEach(resetDatabase);

  it("counts how many companies each source actually confirmed", async () => {
    const first = await prisma.company.create({ data: { name: "가", year: 2025 } });
    const second = await prisma.company.create({ data: { name: "나", year: 2025 } });
    await saveSourceSnapshots(first.id, [NPS, DART]);
    await saveSourceSnapshots(second.id, [{ ...NPS, status: "absent", summary: "없음" }]);

    const coverage = await summariseSourceCoverage(2025);

    expect(coverage.total).toBe(2);
    expect(coverage.bySource.find((entry) => entry.source === "nps")).toMatchObject({ found: 1 });
    expect(coverage.bySource.find((entry) => entry.source === "dart")).toMatchObject({ found: 0 });
  });

  it("leaves out another evaluation year", async () => {
    const older = await prisma.company.create({ data: { name: "작년", year: 2024 } });
    await saveSourceSnapshots(older.id, [NPS]);

    const coverage = await summariseSourceCoverage(2025);

    expect(coverage.total).toBe(0);
    expect(coverage.bySource.every((entry) => entry.found === 0)).toBe(true);
  });

  it("reports every source even when none has been fetched", async () => {
    await prisma.company.create({ data: { name: "가", year: 2025 } });

    const coverage = await summariseSourceCoverage(2025);

    expect(coverage.bySource).toHaveLength(7);
  });
});
