import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listGeocodes, saveGeocode } from "@/lib/repositories/companyGeocode";

async function seed(name: string, year = 2026) {
  return prisma.company.create({ data: { name, year } });
}

const POINT = {
  address: "서울특별시 관악구 관악로 1",
  source: "narajangteo",
  precision: "building" as const,
  roadAddress: "서울특별시 관악구 관악로 1 서울대학교",
  latitude: 37.4602,
  longitude: 126.9527,
};

describe("saveGeocode", () => {
  beforeEach(resetDatabase);

  it("stores one point per company", async () => {
    const company = await seed("크립토랩");

    await saveGeocode(company.id, POINT);

    expect(await prisma.companyGeocode.count()).toBe(1);
  });

  it("replaces the earlier point instead of stacking history", async () => {
    const company = await seed("크립토랩");

    await saveGeocode(company.id, POINT);
    await saveGeocode(company.id, { ...POINT, latitude: 37.5, precision: "road" });

    const [row] = await prisma.companyGeocode.findMany();
    expect(await prisma.companyGeocode.count()).toBe(1);
    expect(row.latitude).toBe(37.5);
    expect(row.precision).toBe("road");
  });

  it("keeps the address it geocoded so the pin can be traced back to a source", async () => {
    const company = await seed("크립토랩");

    await saveGeocode(company.id, POINT);

    const [row] = await prisma.companyGeocode.findMany();
    expect(row).toMatchObject({ address: POINT.address, source: "narajangteo" });
  });
});

describe("listGeocodes", () => {
  beforeEach(resetDatabase);

  it("returns the points of the requested year in display order", async () => {
    const first = await prisma.company.create({ data: { name: "가", year: 2026, displayOrder: 0 } });
    const second = await prisma.company.create({ data: { name: "나", year: 2026, displayOrder: 1 } });
    await saveGeocode(second.id, POINT);
    await saveGeocode(first.id, POINT);

    const points = await listGeocodes(2026);

    expect(points.map((point) => point.name)).toEqual(["가", "나"]);
  });

  it("leaves out a company that has no point rather than emitting a null island", async () => {
    const placed = await seed("가");
    await seed("나");
    await saveGeocode(placed.id, POINT);

    expect((await listGeocodes(2026)).map((point) => point.name)).toEqual(["가"]);
  });

  it("reads only the requested year", async () => {
    const older = await seed("작년", 2025);
    await saveGeocode(older.id, POINT);

    expect(await listGeocodes(2026)).toEqual([]);
  });
});
