import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectNews,
  removeDuplicates,
  dedupeByLink,
  pressNameFromUrl,
  classifyRelevance,
  NewsRateLimitError,
} from "@/lib/services/newsCollector";
import type { NewsItem } from "@/lib/services/newsTypes";
import naverFixture from "./__fixtures__/naver-news.json";
import googleFixture from "./__fixtures__/google-news.rss?raw";

function fakeFetch(overrides: { naverStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("naverapihub.apigw.ntruss.com")) {
      if (overrides.naverStatus && overrides.naverStatus !== 200) {
        return new Response("", { status: overrides.naverStatus });
      }
      const start = Number(new URL(url).searchParams.get("start") ?? "1");
      return new Response(JSON.stringify(start === 1 ? naverFixture : { items: [] }), { status: 200 });
    }
    if (url.includes("news.google.com/rss/search")) {
      return new Response(googleFixture, { status: 200 });
    }
    return new Response("<html><body></body></html>", { status: 200 });
  }) as unknown as typeof fetch;
}

describe("pressNameFromUrl", () => {
  it("maps a known publisher domain to its Korean name", () => {
    expect(pressNameFromUrl("https://www.etnews.com/2024")).toBe("전자신문");
  });

  it("falls back to the hostname for an unmapped publisher", () => {
    expect(pressNameFromUrl("https://unknown.example.com/a")).toBe("unknown.example.com");
  });

  it("does not throw on a malformed link", () => {
    expect(pressNameFromUrl("not-a-url")).toBe("알 수 없음");
  });
});

describe("removeDuplicates", () => {
  const base: NewsItem = {
    title: "",
    link: "",
    description: "",
    content: "",
    published: "2025-01-01T00:00:00.000Z",
    source: "",
    provider: "naver",
    titleMatch: false,
    mentions: 0,
    relevance: "unrelated",
  };

  it("drops a rewritten headline that says the same thing", () => {
    const { items, removed } = removeDuplicates(
      [
        { ...base, title: "넷록스, 시리즈A 투자 유치" },
        { ...base, title: "넷록스 시리즈A 투자유치" },
        { ...base, title: "전혀 다른 기사 제목입니다" },
      ],
      0.5,
    );

    expect(items).toHaveLength(2);
    expect(removed).toBe(1);
  });

  it("collapses the same resolved link across providers, keeping the naver copy", () => {
    const { items, removed } = dedupeByLink([
      { ...base, title: "같은 기사 - 비즈워치", link: "https://biz.example.kr/a/1", provider: "google", source: "비즈워치" },
      { ...base, title: "같은 기사", link: "https://biz.example.kr/a/1", provider: "naver", source: "비즈니스워치" },
      { ...base, title: "다른 기사", link: "https://biz.example.kr/a/2", provider: "naver" },
    ]);

    expect(items.map((item) => [item.link, item.provider])).toEqual([
      ["https://biz.example.kr/a/1", "naver"],
      ["https://biz.example.kr/a/2", "naver"],
    ]);
    expect(removed).toBe(1);
  });

  it("keeps everything when the threshold disables deduplication", () => {
    const { removed } = removeDuplicates([{ ...base, title: "같은 제목" }, { ...base, title: "같은 제목" }], 0);

    expect(removed).toBe(0);
  });
});

describe("classifyRelevance", () => {
  it("treats a title match as the article being about the company", () => {
    expect(classifyRelevance({ title: "넷록스 투자 유치", content: "본문", name: "넷록스" })).toMatchObject({
      titleMatch: true,
      relevance: "primary",
    });
  });

  it("treats three or more body mentions as the article being about the company", () => {
    expect(
      classifyRelevance({ title: "통신 3사 협력", content: "넷록스 넷록스 넷록스", name: "넷록스" }),
    ).toMatchObject({ titleMatch: false, mentions: 3, relevance: "primary" });
  });

  it("treats a single passing mention as a mention, not a subject", () => {
    expect(
      classifyRelevance({
        title: "TTA·6G포럼, 필리핀 통신사와 교류",
        content: "참여 기업으로 넷록스 등이 이름을 올렸다",
        name: "넷록스",
      }),
    ).toMatchObject({ mentions: 1, relevance: "mention" });
  });

  it("promotes two mentions when the company appears in the lead", () => {
    expect(
      classifyRelevance({ title: "업계 동향", content: `넷록스가 나선다. ${"내용 ".repeat(200)}넷록스`, name: "넷록스" }),
    ).toMatchObject({ relevance: "primary" });
  });

  it("marks an article that never names the company as unrelated", () => {
    expect(classifyRelevance({ title: "삼성전자 실적", content: "반도체", name: "넷록스" })).toMatchObject({
      mentions: 0,
      relevance: "unrelated",
    });
  });
});

describe("collectNews", () => {
  beforeEach(() => {
    process.env.NCP_APIGW_API_KEY_ID = "hub-id";
    process.env.NCP_APIGW_API_KEY = "hub-secret";
  });

  it("calls the API HUB endpoint with the HUB headers, not the legacy ones", async () => {
    const fetchImpl = fakeFetch();

    await collectNews({ query: "넷록스", google: false }, { fetchImpl });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("https://naverapihub.apigw.ntruss.com/search/v1/news");
    expect((init as RequestInit).headers).toMatchObject({
      "X-NCP-APIGW-API-KEY-ID": "hub-id",
      "X-NCP-APIGW-API-KEY": "hub-secret",
    });
  });

  it("searches by relevance and quotes the company name", async () => {
    const fetchImpl = fakeFetch();

    await collectNews({ query: "넷록스", google: false }, { fetchImpl });

    const url = new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));
    expect(url.searchParams.get("sort")).toBe("sim");
    expect(url.searchParams.get("query")).toBe('"넷록스"');
  });

  it("strips the markup Naver wraps around matched terms", async () => {
    const { items } = await collectNews({ query: "넷록스", google: false }, { fetchImpl: fakeFetch() });

    expect(items.every((item) => !item.title.includes("<b>"))).toBe(true);
    expect(items[0].title).toContain("넷록스");
  });

  it("merges both providers and records where each item came from", async () => {
    const { items } = await collectNews({ query: "넷록스" }, { fetchImpl: fakeFetch() });

    expect(items.some((item) => item.provider === "naver")).toBe(true);
    expect(items.some((item) => item.provider === "google")).toBe(true);
  });

  it("reports no news when nothing collected is about the company", async () => {
    const { noNews, primaryCount } = await collectNews(
      { query: "논스랩", google: false },
      { fetchImpl: fakeFetch() },
    );

    expect(primaryCount).toBe(0);
    expect(noNews).toBe(true);
  });

  it("puts articles about the company ahead of passing mentions", async () => {
    const { items } = await collectNews({ query: "넷록스", google: false }, { fetchImpl: fakeFetch() });

    const firstMention = items.findIndex((item) => item.relevance !== "primary");
    const lastPrimary = items.map((item) => item.relevance).lastIndexOf("primary");
    expect(firstMention === -1 || lastPrimary < firstMention).toBe(true);
  });

  it("drops articles published before the requested period", async () => {
    const { items } = await collectNews(
      { query: "넷록스", google: false, startDate: "2030-01-01" },
      { fetchImpl: fakeFetch() },
    );

    expect(items).toHaveLength(0);
  });

  it("caps the collection at the requested limit", async () => {
    const { items } = await collectNews({ query: "넷록스", google: false, limit: 2 }, { fetchImpl: fakeFetch() });

    expect(items).toHaveLength(2);
  });

  it("raises a typed error when the HUB quota is exhausted", async () => {
    await expect(
      collectNews({ query: "넷록스", google: false }, { fetchImpl: fakeFetch({ naverStatus: 429 }) }),
    ).rejects.toBeInstanceOf(NewsRateLimitError);
  });

  it("still returns Naver results when Google RSS is down", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("naverapihub")) return new Response(JSON.stringify(naverFixture), { status: 200 });
      if (url.includes("news.google.com")) return new Response("", { status: 503 });
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    const { items, errors } = await collectNews({ query: "넷록스" }, { fetchImpl });

    expect(items.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("google");
  });
});

describe("classifyRelevance 띄어쓰기", () => {
  it("recognises the company when the article writes the name without its space", () => {
    const result = classifyRelevance({
      title: "코난테크놀로지, 군 AI 사업 수주",
      content: "코난테크놀로지가 계약을 맺었다. 코난테크놀로지는 상장사다.",
      name: "코난 테크놀로지",
    });

    expect(result.titleMatch).toBe(true);
    expect(result.relevance).toBe("primary");
  });
});

describe("리뷰 확정 결함 회귀", () => {
  const base: NewsItem = {
    title: "",
    link: "",
    description: "",
    content: "",
    published: "2025-01-01T00:00:00.000Z",
    source: "",
    provider: "naver",
    titleMatch: false,
    mentions: 0,
    relevance: "unrelated",
  };

  beforeEach(() => {
    process.env.NCP_APIGW_API_KEY_ID = "hub-id";
    process.env.NCP_APIGW_API_KEY = "hub-secret";
  });

  function naverFetch(items: Array<{ title: string; link: string; pubDate: string }>) {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("naverapihub.apigw.ntruss.com")) {
        return new Response(
          JSON.stringify({ items: items.map((entry) => ({ title: entry.title, originallink: entry.link, link: entry.link, description: "", pubDate: entry.pubDate })) }),
          { status: 200 },
        );
      }
      return new Response("<html><body></body></html>", { status: 200 });
    }) as unknown as typeof fetch;
  }

  it("keeps the same wire headline from different outlets and dedupes only within one outlet", () => {
    const { items, removed } = removeDuplicates(
      [
        { ...base, title: "넷록스, 시리즈A 투자 유치", source: "연합뉴스" },
        { ...base, title: "넷록스 시리즈A 투자유치", source: "전자신문" },
        { ...base, title: "넷록스 시리즈A 투자 유치!", source: "연합뉴스" },
      ],
      0.5,
    );

    expect(items).toHaveLength(2);
    expect(removed).toBe(1);
  });

  it("promotes two spaced-name mentions when the first sits in the lead", () => {
    const filler = "다른 회사 이야기가 길게 이어진다. ".repeat(30);
    const result = classifyRelevance({
      title: "AI 업계 소식",
      content: `코난 테크놀로지가 계약을 맺었다. ${filler}코난 테크놀로지 관계자는 말했다.`,
      name: "코난 테크놀로지",
    });

    expect(result.mentions).toBe(2);
    expect(result.relevance).toBe("primary");
  });

  it("drops only the article with a broken date, not the whole Naver feed", async () => {
    const fetchImpl = naverFetch([
      { title: "정상 기사", link: "https://a/1", pubDate: "Mon, 10 Aug 2026 10:00:00 +0900" },
      { title: "깨진 기사", link: "https://a/2", pubDate: "" },
    ]);

    const { items, errors } = await collectNews({ query: "넷록스", google: false }, { fetchImpl });

    expect(items.map((item) => item.link)).toEqual(["https://a/1"]);
    expect(errors).toEqual([]);
  });

  it("drops the google copy of an article naver already delivered once links resolve", async () => {
    const link = "https://biz.example.kr/a/1";
    const token = Buffer.from(link).toString("base64url");
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>c</title><item><title>넷록스 투자 유치 - 비즈워치</title><link>https://news.google.com/rss/articles/${token}?oc=5</link><pubDate>Mon, 10 Aug 2026 10:00:00 +0900</pubDate><source url="https://biz.example.kr">비즈워치</source></item></channel></rss>`;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("naverapihub.apigw.ntruss.com")) {
        return new Response(
          JSON.stringify({ items: [{ title: "넷록스 투자 유치", originallink: link, link, description: "", pubDate: "Mon, 10 Aug 2026 10:00:00 +0900" }] }),
          { status: 200 },
        );
      }
      if (url.includes("news.google.com/rss/search")) return new Response(rss, { status: 200 });
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const { items, duplicatesRemoved } = await collectNews({ query: "넷록스" }, { fetchImpl });

    expect(items.map((item) => [item.link, item.provider])).toEqual([[link, "naver"]]);
    expect(duplicatesRemoved).toBe(1);
  });

  it("keeps an article published in the KST afternoon of the end date — the day is inclusive", async () => {
    const fetchImpl = naverFetch([{ title: "마감일 기사", link: "https://a/1", pubDate: "Sat, 15 Aug 2026 14:00:00 +0900" }]);

    const { items } = await collectNews({ query: "넷록스", google: false, startDate: "2026-08-15", endDate: "2026-08-15" }, { fetchImpl });

    expect(items).toHaveLength(1);
  });
});
