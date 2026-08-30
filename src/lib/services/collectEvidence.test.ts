import { describe, it, expect, vi } from "vitest";
import { collectEvidence, type Collectors } from "@/lib/services/collectEvidence";

const NO_PENSION = {
  found: false,
  subscribers: null,
  noticeAmount: null,
  averageBaseIncome: null,
  annualPayroll: null,
  months: [],
  growth: null,
};

function collectors(over: Partial<Collectors> = {}): Collectors {
  return {
    getCompanyProfile: vi.fn(async () => ({ found: false, reason: "없음" })),
    getFinancialSummary: vi.fn(async () => ({
      found: false,
      fiscalYear: 2026,
      revenue: null,
      operatingIncome: null,
      netIncome: null,
      totalAssets: null,
    })),
    lookupCorpOutline: vi.fn(async () => ({ found: false, employeeCount: null })),
    checkBusinessStatus: vi.fn(async () => ({ checked: true, isActive: true, businessNo: "6258700800" })),
    getProcurementProfile: vi.fn(async () => ({ found: true, businessNo: "6258700800", employeeCount: 46 })),
    findCertification: vi.fn(async () => ({ certified: false, expired: false })),
    lookupWorkplace: vi.fn(async () => NO_PENSION),
    ...over,
  };
}

const COMPANY = { id: 1, name: "크립토랩", year: 2026 };

describe("collectEvidence", () => {
  it("skips the financial-services fallback when DART already gave the business number", async () => {
    const deps = collectors({
      getCompanyProfile: vi.fn(async () => ({ found: true, businessNo: "1208824298" })),
    });

    const result = await collectEvidence(COMPANY, deps);

    expect(result.businessNo).toBe("1208824298");
    expect(result.businessNoSource).toBe("dart");
    expect(deps.lookupCorpOutline).not.toHaveBeenCalled();
    expect(result.evidence.outline).toBeNull();
  });

  it("falls back to the financial-services registry when DART has no such company", async () => {
    const deps = collectors({
      lookupCorpOutline: vi.fn(async () => ({ found: true, businessNo: "6258700800", employeeCount: 55 })),
    });

    const result = await collectEvidence(COMPANY, deps);

    expect(result.businessNo).toBe("6258700800");
    expect(result.businessNoSource).toBe("fsc");
  });

  it("does not call the number-only sources when no business number was found", async () => {
    const deps = collectors();

    const result = await collectEvidence(COMPANY, deps);

    expect(result.businessNo).toBeNull();
    expect(result.businessNoSource).toBeNull();
    expect(deps.checkBusinessStatus).not.toHaveBeenCalled();
    expect(deps.getProcurementProfile).not.toHaveBeenCalled();
    expect(result.evidence.businessStatus).toBeNull();
    expect(result.evidence.procurement).toBeNull();
  });

  it("passes the business number to the pension lookup so a namesake is ruled out", async () => {
    const deps = collectors({
      getCompanyProfile: vi.fn(async () => ({ found: true, businessNo: "2698100419" })),
    });

    await collectEvidence({ ...COMPANY, name: "옥타코" }, deps);

    expect(deps.lookupWorkplace).toHaveBeenCalledWith("옥타코", { businessNo: "2698100419" });
  });

  it("still asks the pension and venture registries when every number source failed", async () => {
    const deps = collectors();

    await collectEvidence({ ...COMPANY, name: "넷록스" }, deps);

    expect(deps.lookupWorkplace).toHaveBeenCalledWith("넷록스", { businessNo: undefined });
    expect(deps.findCertification).toHaveBeenCalled();
  });

  it("asks DART for the financial year the company is being evaluated in", async () => {
    const deps = collectors();

    await collectEvidence({ ...COMPANY, year: 2024 }, deps);

    expect(deps.getFinancialSummary).toHaveBeenCalledWith("크립토랩", 2024);
  });

  it("uses the number the selection sheet already carries instead of rediscovering it", async () => {
    const deps = collectors();

    const result = await collectEvidence(
      { name: "동아사이언스", year: 2025, businessNo: "1018162201" },
      deps,
    );

    expect(result.businessNo).toBe("1018162201");
    expect(result.businessNoSource).toBe("registry");
    expect(deps.lookupCorpOutline).not.toHaveBeenCalled();
    expect(deps.checkBusinessStatus).toHaveBeenCalledWith("1018162201");
  });

  it("still asks DART for the company outline even when the number is already known", async () => {
    const deps = collectors();

    await collectEvidence({ name: "동아사이언스", year: 2025, businessNo: "1018162201" }, deps);

    expect(deps.getCompanyProfile).toHaveBeenCalledWith("동아사이언스");
  });

  it("prefers the registry number over a different one DART returns", async () => {
    const deps = collectors({
      getCompanyProfile: vi.fn(async () => ({ found: true, businessNo: "9999999999" })),
    });

    const result = await collectEvidence(
      { name: "동아사이언스", year: 2025, businessNo: "1018162201" },
      deps,
    );

    expect(result.businessNo).toBe("1018162201");
    expect(result.businessNoSource).toBe("registry");
  });

  it("a DART 'none' decision skips the lookup and reads as absent by decision", async () => {
    const deps = collectors();
    const result = await collectEvidence({ name: "㈜가", year: 2026, businessNo: "1234567890" }, deps, { dart: "none" });
    expect(deps.getCompanyProfile).not.toHaveBeenCalled();
    expect(result.evidence.profile).toMatchObject({ found: false, decidedAbsent: true });
  });

  it("a DART corp code decision is passed as a hint and an NPS prefix pins the workplace", async () => {
    const deps = collectors();
    await collectEvidence({ name: "㈜가", year: 2026, businessNo: null }, deps, { dart: "00123456", nps: "625870" });
    expect(deps.getCompanyProfile).toHaveBeenCalledWith("㈜가", undefined, { corpCode: "00123456" });
    expect(deps.lookupWorkplace).toHaveBeenCalledWith("㈜가", { businessNo: "625870" });
  });
});
