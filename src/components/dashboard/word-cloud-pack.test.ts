import { describe, expect, test } from "vitest";
import { packRect, toneIndex } from "@/components/dashboard/word-cloud";

const BOX = { width: 520, height: 300, min: 11, max: 40 };

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `기업${index + 1}`,
    value: (count - index) * 10,
  }));
}

const EPSILON = 1e-6;

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width - EPSILON &&
    Math.abs(a.y - b.y) * 2 < a.height + b.height - EPSILON
  );
}

describe("packRect", () => {
  test("places every company, because a dropped name is a company that vanished", () => {
    const { placed, dropped } = packRect(items(50), BOX);

    expect(dropped).toBe(0);
    expect(placed).toHaveLength(50);
  });

  test("never lets two names overlap", () => {
    const { placed } = packRect(items(50), BOX);

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  test("keeps every name inside the box", () => {
    const { placed } = packRect(items(50), BOX);

    for (const node of placed) {
      expect(Math.abs(node.x) + node.width / 2).toBeLessThanOrEqual(BOX.width / 2 + 0.5);
      expect(Math.abs(node.y) + node.height / 2).toBeLessThanOrEqual(BOX.height / 2 + 0.5);
    }
  });

  test("shrinks the type when the names would not otherwise fit", () => {
    const roomy = packRect(items(6), BOX);
    const crowded = packRect(items(60), BOX);

    expect(crowded.scale).toBeLessThan(roomy.scale);
    expect(crowded.dropped).toBe(0);
  });

  test("grows the type to fill the box instead of huddling in the middle", () => {
    const { scale, used } = packRect(items(6), BOX);

    expect(scale).toBeGreaterThan(1);
    expect(used.height).toBeGreaterThanOrEqual(BOX.height * 0.65);
  });

  test("fills the box for a crowded list too", () => {
    const { used } = packRect(items(50), BOX);

    expect(used.height).toBeGreaterThanOrEqual(BOX.height * 0.65);
  });

  test("never lets a single name outgrow a readable size", () => {
    const { placed } = packRect([{ id: 1, name: "가", value: 100 }], BOX);

    expect(placed[0].size).toBeLessThanOrEqual(72);
  });

  test("puts the heaviest name first so it lands at the top", () => {
    const { placed } = packRect(items(20), BOX);

    expect(placed[0].name).toBe("기업1");
    expect(placed[0].size).toBeGreaterThan(placed[placed.length - 1].size);
  });

  test("lays the same data out the same way every time", () => {
    expect(packRect(items(20), BOX)).toEqual(packRect(items(20), BOX));
  });

  test("has nothing to place for an empty list", () => {
    expect(packRect([], BOX)).toMatchObject({ placed: [], dropped: 0, scale: 1 });
  });
});

describe("toneIndex", () => {
  test("gives the heaviest name the deepest tone", () => {
    expect(toneIndex(0, 40, 4)).toBe(0);
  });

  test("gives the lightest name the palest tone", () => {
    expect(toneIndex(39, 40, 4)).toBe(3);
  });

  test("spreads ranks evenly across the ramp rather than by raw value", () => {
    expect(toneIndex(10, 40, 4)).toBe(1);
    expect(toneIndex(20, 40, 4)).toBe(2);
  });

  test("keeps a lone name at the deepest tone", () => {
    expect(toneIndex(0, 1, 4)).toBe(0);
  });

  test("never reports a box larger than the one it was given", () => {
    const { used } = packRect(items(4), BOX);

    expect(used.height).toBeLessThanOrEqual(BOX.height);
    expect(used.width).toBeLessThanOrEqual(BOX.width);
  });

  test("shrinks until a long name fits the width instead of letting it hang out", () => {
    const long = [{ id: 1, name: "아주대학교 산학협력단 부설 연구소", value: 100 }];

    const { placed, used } = packRect(long, { width: 200, height: 300, min: 11, max: 40 });

    expect(placed[0].width).toBeLessThanOrEqual(200);
    expect(used.width).toBeLessThanOrEqual(200);
  });
});
