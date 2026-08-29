import { describe, it, expect, vi } from "vitest";
import { resolveGoogleNewsUrl, fetchArticleBody, enrichWithBodies, extractReadableText } from "@/lib/services/articleBody";
import type { NewsItem } from "@/lib/services/newsTypes";
import tokens from "./__fixtures__/google-tokens.json";
import naverHtml from "./__fixtures__/article-naver.html?raw";

function jsonResponse(body: string) {
  return new Response(body, { status: 200 });
}

describe("resolveGoogleNewsUrl", () => {
  it("passes a publisher url straight through without calling google", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;

    expect(await resolveGoogleNewsUrl("https://www.yna.co.kr/view/1", { fetchImpl })).toBe(
      "https://www.yna.co.kr/view/1",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves a modern token through the batchexecute endpoint", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(
          ")]}'\n" +
            JSON.stringify([
              ["wrb.fr", "Fbv4je", '["garturlres","https://www.yna.co.kr/view/9",1]'],
            ]),
        );
      }
      return jsonResponse('<div data-n-a-sg="sig123" data-n-a-ts="1700000000"></div>');
    }) as unknown as typeof fetch;

    const resolved = await resolveGoogleNewsUrl(
      `https://news.google.com/rss/articles/${tokens.modern}?oc=5`,
      { fetchImpl },
    );

    expect(resolved).toBe("https://www.yna.co.kr/view/9");
  });

  it("falls back to base64 for a legacy token when google refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;

    const resolved = await resolveGoogleNewsUrl(
      `https://news.google.com/rss/articles/${tokens.legacyBase64}?oc=5`,
      { fetchImpl },
    );

    expect(resolved).toBe("https://www.yna.co.kr/view/2");
  });

  it("returns the google url unchanged when both strategies fail", async () => {
    const link = "https://news.google.com/rss/articles/not-a-token?oc=5";
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;

    expect(await resolveGoogleNewsUrl(link, { fetchImpl })).toBe(link);
  });
});

describe("fetchArticleBody", () => {
  it("extracts the article text and drops navigation and scripts", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(naverHtml, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    ) as unknown as typeof fetch;

    const body = await fetchArticleBody("https://n.news.naver.com/article/1/2", { fetchImpl });

    expect(body).toContain("시리즈A 투자를 유치했다");
    expect(body).not.toContain("회원가입");
    expect(body).not.toContain("var ad");
  });

  it("returns an empty string when the publisher blocks the request", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;

    expect(await fetchArticleBody("https://x.kr/a", { fetchImpl })).toBe("");
  });

  it("returns an empty string instead of throwing when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await fetchArticleBody("https://x.kr/a", { fetchImpl })).toBe("");
  });

  it("gives up on a google url it could not resolve rather than crawling google", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;

    expect(
      await fetchArticleBody("https://news.google.com/rss/articles/not-a-token?oc=5", { fetchImpl }),
    ).toBe("");
  });

  it("caps a very long body so one article cannot fill the prompt", async () => {
    const long = `<html><body><div id="dic_area"><p>${"본문 ".repeat(4000)}</p></div></body></html>`;
    const fetchImpl = vi.fn(async () => new Response(long, { status: 200 })) as unknown as typeof fetch;

    expect((await fetchArticleBody("https://x.kr/a", { fetchImpl })).length).toBeLessThanOrEqual(4000);
  });
});

describe("enrichWithBodies", () => {
  const item = (patch: Partial<NewsItem> = {}): NewsItem => ({
    title: "넷록스, 시리즈A 투자 유치",
    link: "https://x.kr/ok",
    description: "짧은 요약",
    content: "짧은 요약",
    published: "2025-01-01T00:00:00.000Z",
    source: "x.kr",
    provider: "naver",
    titleMatch: false,
    mentions: 0,
    relevance: "unrelated",
    ...patch,
  });

  it("replaces the snippet with the crawled body", async () => {
    const fetchImpl = vi.fn(async () => new Response(naverHtml, { status: 200 })) as unknown as typeof fetch;

    const [enriched] = await enrichWithBodies([item()], { fetchImpl });

    expect(enriched.content).toContain("시리즈A 투자를 유치했다");
  });

  it("keeps the snippet when the body could not be crawled", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;

    const [enriched] = await enrichWithBodies([item()], { fetchImpl });

    expect(enriched.content).toBe("짧은 요약");
  });

  it("keeps the original order when crawling many articles at once", async () => {
    const fetchImpl = vi.fn(async () => new Response(naverHtml, { status: 200 })) as unknown as typeof fetch;
    const items = ["a", "b", "c", "d", "e"].map((slug) =>
      item({ link: `https://x.kr/${slug}`, title: slug }),
    );

    const enriched = await enrichWithBodies(items, { fetchImpl, concurrency: 3 });

    expect(enriched.map((entry) => entry.title)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("extractReadableText", () => {
  function fakeDom() {
    let closed = 0;
    const createDom = (html: string) => {
      const doc = document.implementation.createHTMLDocument();
      doc.body.innerHTML = html;
      return {
        window: {
          document: doc,
          close: () => {
            closed += 1;
          },
        },
      };
    };
    return { createDom, closed: () => closed };
  }

  const ARTICLE = `<article><h1>크립토랩 시리즈B</h1>${"<p>동형암호 기업 크립토랩이 200억원 규모 투자를 유치했다.</p>".repeat(8)}</article>`;

  it("pulls the article text out of the page", () => {
    const dom = fakeDom();

    expect(extractReadableText(ARTICLE, "https://n.example/1", dom)).toContain("동형암호");
  });

  it("closes the parsing window so a batch of articles does not pile up documents", () => {
    const dom = fakeDom();

    extractReadableText(ARTICLE, "https://n.example/1", dom);

    expect(dom.closed()).toBe(1);
  });

  it("closes the window even when parsing throws", () => {
    let closed = 0;
    const createDom = () => ({
      window: {
        get document(): Document {
          throw new Error("파싱 실패");
        },
        close: () => {
          closed += 1;
        },
      },
    });

    expect(() => extractReadableText(ARTICLE, "https://n.example/1", { createDom })).toThrow();
    expect(closed).toBe(1);
  });
})
