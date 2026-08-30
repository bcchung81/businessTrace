import { describe, expect, test, vi } from "vitest";
import { collectForCompany, parseAliases } from "@/lib/services/collectForCompany";
import type { NewsItem } from "@/lib/services/newsTypes";

const item = (link: string, title = link): NewsItem => ({ title, link, description: "", content: "", published: "2026-08-01", source: "s", provider: "naver", titleMatch: true, mentions: 1, relevance: "primary" });

describe("parseAliases", () => {
  test("reads a JSON array and tolerates junk", () => {
    expect(parseAliases('["한빛IT","Hanbit ICT"]')).toEqual(["한빛IT", "Hanbit ICT"]);
    expect(parseAliases(null)).toEqual([]);
    expect(parseAliases("oops")).toEqual([]);
  });
});

describe("collectForCompany", () => {
  test("queries the name and every alias, merging by link", async () => {
    const collect = vi
      .fn()
      .mockResolvedValueOnce({ items: [item("https://n/1"), item("https://n/2")], duplicatesRemoved: 1, errors: [], primaryCount: 2, noNews: false })
      .mockResolvedValueOnce({ items: [item("https://n/2"), item("https://n/3")], duplicatesRemoved: 0, errors: ["구글 오류"], primaryCount: 2, noNews: false });
    const result = await collectForCompany({ name: "㈜한빛정보통신", aliases: '["한빛IT"]' }, { limit: 20 }, { collect });
    expect(collect.mock.calls.map((c) => c[0].query)).toEqual(["㈜한빛정보통신", "한빛IT"]);
    expect(result.items.map((i) => i.link)).toEqual(["https://n/1", "https://n/2", "https://n/3"]);
    expect(result.duplicatesRemoved).toBe(2);
    expect(result.errors).toEqual(["구글 오류"]);
    expect(result.primaryCount).toBe(3);
    expect(result.noNews).toBe(false);
  });

  test("without aliases it is a single query", async () => {
    const collect = vi.fn().mockResolvedValue({ items: [], duplicatesRemoved: 0, errors: [], primaryCount: 0, noNews: true });
    const result = await collectForCompany({ name: "㈜가", aliases: null }, { limit: 20 }, { collect });
    expect(collect).toHaveBeenCalledTimes(1);
    expect(result.noNews).toBe(true);
  });
});
