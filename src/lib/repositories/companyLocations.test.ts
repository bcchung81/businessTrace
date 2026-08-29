import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/lib/test-support/db";
import { listCompanyAddresses } from "@/lib/repositories/companyLocations";
import { saveSourceSnapshots } from "@/lib/repositories/sourceSnapshot";

async function seed(name: string, year = 2026) {
  return prisma.company.create({ data: { name, year } });
}

describe("listCompanyAddresses", () => {
  beforeEach(resetDatabase);

  it("collects the address every source reported for a company", async () => {
    const company = await seed("크립토랩");
    await saveSourceSnapshots(company.id, [
      { source: "nps", status: "found", summary: "", payload: { address: "서울특별시 관악구 관악로" } },
      {
        source: "narajangteo",
        status: "found",
        summary: "",
        payload: { address: "서울특별시 관악구 관악로 1" },
      },
    ]);

    const [entry] = await listCompanyAddresses(2026);

    expect(entry.addresses).toEqual([
      { source: "nps", address: "서울특별시 관악구 관악로" },
      { source: "narajangteo", address: "서울특별시 관악구 관악로 1" },
    ]);
  });

  it("skips sources that carry no address rather than emitting empty strings", async () => {
    const company = await seed("올림플래닛");
    await saveSourceSnapshots(company.id, [
      { source: "dart", status: "found", summary: "", payload: { corpCode: "01599547" } },
      { source: "nps", status: "found", summary: "", payload: { address: "서울특별시 강남구 테헤란로" } },
    ]);

    const [entry] = await listCompanyAddresses(2026);

    expect(entry.addresses).toEqual([{ source: "nps", address: "서울특별시 강남구 테헤란로" }]);
  });

  it("keeps a company with no address at all so the map can report it as missing", async () => {
    await seed("SDT");

    const [entry] = await listCompanyAddresses(2026);

    expect(entry).toMatchObject({ name: "SDT", addresses: [] });
  });

  it("reads only the requested year", async () => {
    await seed("올해", 2026);
    await seed("작년", 2025);

    const entries = await listCompanyAddresses(2026);

    expect(entries.map((entry) => entry.name)).toEqual(["올해"]);
  });
});
