import { describe, expect, it } from "vitest";
import { auc, cohenKappa, humanTruth, passesGate, scoreAbout, sentimentEvent, spearman, stratifiedAccuracy, wilson } from "@/lib/services/jevGate";

describe("wilson", () => {
  it("gives the 95% score interval of a proportion", () => {
    const [low, high] = wilson(9, 10);
    expect(low).toBeCloseTo(0.596, 3);
    expect(high).toBeCloseTo(0.982, 3);
  });

  it("admits it knows nothing when there are no trials", () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("auc", () => {
  it("counts ties as half a win", () => {
    const scored = [
      { y: true, s: 0.9 },
      { y: true, s: 0.6 },
      { y: false, s: 0.6 },
      { y: false, s: 0.1 },
    ];
    expect(auc(scored)).toBe(0.875);
  });

  it("is undefined when one class is missing", () => {
    expect(auc([{ y: true, s: 0.4 }])).toBeNaN();
  });
});

describe("cohenKappa", () => {
  it("discounts agreement expected by chance", () => {
    const pairs: [string, string][] = [
      ["a", "a"],
      ["a", "b"],
      ["b", "b"],
      ["b", "b"],
    ];
    expect(cohenKappa(pairs)).toBe(0.5);
  });

  it("is 1 when both raters only ever use the same label", () => {
    expect(cohenKappa([["none", "none"], ["none", "none"]])).toBe(1);
  });
});

describe("spearman", () => {
  it("is 1 for the same order and -1 for the reverse", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("gives tied values their average rank", () => {
    expect(spearman([1, 1, 2], [1, 2, 3])).toBeCloseTo(Math.sqrt(3) / 2, 10);
  });

  it("is undefined when one side does not vary", () => {
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNaN();
  });
});

describe("humanTruth", () => {
  it("reads yes and no, and leaves unsure or unlabelled items out", () => {
    expect(humanTruth({ about: "yes" })).toBe(true);
    expect(humanTruth({ about: "no" })).toBe(false);
    expect(humanTruth({ about: "unsure" })).toBeNull();
    expect(humanTruth(undefined)).toBeNull();
  });
});

describe("scoreAbout", () => {
  it("counts held articles as not about the company and reports the decisive share apart", () => {
    const rows = [
      { truth: true, about: true, held: false, confidence: 0.9 },
      { truth: true, about: false, held: true, confidence: 0.5 },
      { truth: false, about: false, held: false, confidence: 0.1 },
      { truth: null, about: true, held: false, confidence: 0.95 },
      { truth: false, about: true, held: false, confidence: 0.8 },
    ];

    const score = scoreAbout(rows);

    expect(score.n).toBe(4);
    expect(score.agree).toBe(2);
    expect(score.held).toBe(1);
    expect(score.decisive).toEqual({ n: 3, agree: 2 });
    expect(score.auc).toBe(0.75);
    expect(score.misses).toEqual([rows[1], rows[4]]);
  });
});

describe("stratifiedAccuracy", () => {
  it("weights each stratum's accuracy by its population size", () => {
    const rows = [
      { stratum: "A", correct: true },
      { stratum: "A", correct: false },
      ...Array.from({ length: 4 }, () => ({ stratum: "C", correct: true })),
    ];

    expect(stratifiedAccuracy(rows, { A: 10, C: 90 })).toEqual({ estimate: 0.95, missing: [] });
  });

  it("names strata nobody reviewed and estimates over the rest", () => {
    const rows = [
      { stratum: "A", correct: true },
      { stratum: "A", correct: false },
      { stratum: "C", correct: true },
    ];

    const result = stratifiedAccuracy(rows, { A: 10, B: 5, C: 85 });

    expect(result.missing).toEqual(["B"]);
    expect(result.estimate).toBeCloseTo(90 / 95, 10);
  });
});

describe("sentimentEvent", () => {
  it("uses the same thresholds as press events", () => {
    expect(sentimentEvent(6)).toBe("positive");
    expect(sentimentEvent(5)).toBe("none");
    expect(sentimentEvent(-3)).toBe("none");
    expect(sentimentEvent(-4)).toBe("negative");
  });
});

describe("passesGate", () => {
  it("only lets a human-labelled estimate of at least 95% through", () => {
    expect(passesGate(0.99, "gold")).toBe(false);
    expect(passesGate(0.95, "human")).toBe(true);
    expect(passesGate(0.949, "human")).toBe(false);
  });
});
