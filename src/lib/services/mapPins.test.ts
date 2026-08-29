import { describe, it, expect } from "vitest";
import { buildPins, type GeocodedCompany } from "@/lib/services/mapPins";

function entry(overrides: Partial<GeocodedCompany> & { name: string }): GeocodedCompany {
  return {
    companyId: 1,
    latitude: 37.46,
    longitude: 126.95,
    precision: "building",
    subscribers: 50,
    conflict: null,
    address: "서울특별시 관악구 관악로 1",
    ...overrides,
  };
}

describe("buildPins", () => {
  it("sizes a pin by the square root of headcount so one big employer does not flatten the rest", () => {
    const pins = buildPins([
      entry({ companyId: 1, name: "길의료재단", subscribers: 3034 }),
      entry({ companyId: 2, name: "딥로딩", subscribers: 6 }),
    ]);
    const big = pins.find((pin) => pin.name === "길의료재단") as (typeof pins)[number];
    const small = pins.find((pin) => pin.name === "딥로딩") as (typeof pins)[number];

    expect(big.radius).toBeGreaterThan(small.radius);
    expect(big.radius / small.radius).toBeLessThan(3034 / 6);
  });

  it("gives every pin a readable minimum so a six-person company is still clickable", () => {
    const [pin] = buildPins([entry({ name: "딥로딩", subscribers: 0 })]);

    expect(pin.radius).toBeGreaterThanOrEqual(8);
  });

  it("marks a pin the source could only place on a road, not at a building", () => {
    const [pin] = buildPins([entry({ name: "크립토랩", precision: "road" })]);

    expect(pin.exact).toBe(false);
  });

  it("marks a pin whose sources disagree so the map never shows it as settled", () => {
    const [pin] = buildPins([entry({ name: "핀텔", conflict: "sido" })]);

    expect(pin.state).toBe("risk");
  });

  it("calls a building-level pin with agreeing sources verified", () => {
    const [pin] = buildPins([entry({ name: "크립토랩" })]);

    expect(pin.state).toBe("verified");
  });

  it("calls a road-level pin with agreeing sources review, because the point is approximate", () => {
    const [pin] = buildPins([entry({ name: "크립토랩", precision: "road" })]);

    expect(pin.state).toBe("review");
  });

  it("puts the biggest employer last so it draws on top of the small ones", () => {
    const pins = buildPins([
      entry({ companyId: 1, name: "딥로딩", subscribers: 6 }),
      entry({ companyId: 2, name: "길의료재단", subscribers: 3034 }),
    ]);

    expect(pins.at(-1)?.name).toBe("길의료재단");
  });

  it("says how precise the pin is in words, because a dot cannot say it", () => {
    const [road] = buildPins([entry({ name: "크립토랩", precision: "road" })]);
    const [building] = buildPins([entry({ name: "올림플래닛", precision: "building" })]);

    expect(road.note).toContain("도로");
    expect(building.note).toContain("건물");
  });
});
