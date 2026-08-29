import { describe, expect, it } from "vitest";
import type { MentionedArticle } from "@/lib/services/coMention";
import { buildNewsCoverage, isStale } from "@/lib/services/newsCoverage";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const COMPANIES = [
  { id: 1, name: "크립토랩" },
  { id: 2, name: "옥타코" },
  { id: 3, name: "아크릴" },
];

function article(over: Partial<MentionedArticle> & { link: string }): MentionedArticle {
  return { title: "", source: "", published: "2026-08-20T00:00:00.000Z", companies: [], ...over };
}

describe("buildNewsCoverage", () => {
  it("counts articles per company and keeps the newest date", () => {
    const coverage = buildNewsCoverage(
      COMPANIES,
      [
        article({ link: "a", published: "2026-08-10T00:00:00.000Z", companies: ["크립토랩"] }),
        article({ link: "b", published: "2026-08-26T00:00:00.000Z", companies: ["크립토랩", "옥타코"] }),
      ],
      NOW,
    );

    expect(coverage.byCompany.find((row) => row.companyId === 1)).toEqual({
      companyId: 1, name: "크립토랩", articles: 2, latest: "2026-08-26T00:00:00.000Z",
    });
    expect(coverage.byCompany.find((row) => row.companyId === 2)?.articles).toBe(1);
  });

  it("keeps companies with no article so silence is visible", () => {
    const coverage = buildNewsCoverage(COMPANIES, [], NOW);

    expect(coverage.byCompany.find((row) => row.companyId === 3)).toEqual({
      companyId: 3, name: "아크릴", articles: 0, latest: null,
    });
  });

  it("counts the last 14 days and the whole set separately", () => {
    const coverage = buildNewsCoverage(
      COMPANIES,
      [
        article({ link: "a", published: "2026-08-26T00:00:00.000Z", companies: ["크립토랩"] }),
        article({ link: "b", published: "2026-07-01T00:00:00.000Z", companies: ["크립토랩"] }),
      ],
      NOW,
    );

    expect(coverage.recent14).toBe(1);
    expect(coverage.total).toBe(2);
  });

  it("ignores names that are not registered companies", () => {
    const coverage = buildNewsCoverage(COMPANIES, [article({ link: "a", companies: ["없는회사"] })], NOW);

    expect(coverage.byCompany.every((row) => row.articles === 0)).toBe(true);
    expect(coverage.total).toBe(1);
  });
});

describe("isStale", () => {
  it("treats no article and anything over 30 days as stale", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale("2026-07-29T00:00:00.000Z", NOW)).toBe(true);
    expect(isStale("2026-08-01T00:00:00.000Z", NOW)).toBe(false);
  });
});
