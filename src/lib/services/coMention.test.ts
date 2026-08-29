import { describe, it, expect } from "vitest";
import { buildCoMentions, type MentionArticle } from "@/lib/services/coMention";

const REGISTRY = ["크립토랩", "올림플래닛", "옥타코", "넷록스"];

function article(over: Partial<MentionArticle> = {}): MentionArticle {
  return {
    subject: "크립토랩",
    title: "동형암호 상용화 앞둔 크립토랩",
    content: "크립토랩은 동형암호 기술을 개발했다.",
    link: "https://news.example.com/1",
    source: "전자신문",
    published: "2026-07-14",
    ...over,
  };
}

describe("buildCoMentions", () => {
  it("draws an edge when the article is about both registered companies", () => {
    const graph = buildCoMentions(
      [article({ title: "크립토랩·옥타코 공동 수주", content: "두 회사가 과제를 맡았다." })],
      REGISTRY,
    );

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ a: "옥타코", b: "크립토랩", articles: 1 });
  });

  it("leaves out a company the article merely brushes past once", () => {
    const graph = buildCoMentions(
      [article({ content: "크립토랩은 동형암호를 개발했다. 옥타코도 있다." })],
      REGISTRY,
    );

    expect(graph.nodes.map((node) => node.name)).toEqual(["크립토랩"]);
    expect(graph.edges).toHaveLength(0);
  });

  it("counts a company the article names three times as a real subject", () => {
    const graph = buildCoMentions(
      [article({ content: "크립토랩과 옥타코. 옥타코는 인증을 받았다. 옥타코 대표가 말했다." })],
      REGISTRY,
    );

    expect(graph.nodes.map((node) => node.name)).toContain("옥타코");
    expect(graph.edges).toHaveLength(1);
  });

  it("never draws a company against itself", () => {
    const graph = buildCoMentions([article({ content: "크립토랩은 크립토랩이다." })], REGISTRY);

    expect(graph.edges).toHaveLength(0);
  });

  it("treats the pair as one edge whichever order the names appear in", () => {
    const graph = buildCoMentions(
      [
        article({ link: "https://n/1", title: "크립토랩과 옥타코" }),
        article({ subject: "옥타코", link: "https://n/2", title: "옥타코와 크립토랩" }),
      ],
      REGISTRY,
    );

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].articles).toBe(2);
  });

  it("keeps the source article links so every edge can be checked", () => {
    const graph = buildCoMentions(
      [
        article({ link: "https://n/1", title: "크립토랩과 옥타코" }),
        article({ link: "https://n/2", title: "크립토랩과 옥타코" }),
      ],
      REGISTRY,
    );

    expect(graph.edges[0].links).toEqual(["https://n/1", "https://n/2"]);
  });

  it("counts a name that only appears in the headline", () => {
    const graph = buildCoMentions(
      [article({ title: "크립토랩·넷록스 공동 개발", content: "두 회사가 협력한다." })],
      REGISTRY,
    );

    expect(graph.edges[0]).toMatchObject({ a: "넷록스", b: "크립토랩" });
  });

  it("ignores a company name that is not in the registry", () => {
    const graph = buildCoMentions([article({ title: "크립토랩과 삼성전자" })], REGISTRY);

    expect(graph.nodes.map((node) => node.name)).toEqual(["크립토랩"]);
    expect(graph.edges).toHaveLength(0);
  });

  it("sizes each node by how often it is mentioned, heaviest first", () => {
    const graph = buildCoMentions(
      [
        article({ content: "크립토랩 크립토랩 크립토랩 크립토랩 옥타코" }),
        article({ subject: "옥타코", title: "옥타코 보안 인증 획득", content: "옥타코 옥타코" }),
      ],
      REGISTRY,
    );

    expect(graph.nodes.map((node) => node.name)).toEqual(["크립토랩", "옥타코"]);
    expect(graph.nodes[0]).toMatchObject({ name: "크립토랩", mentions: 5, articles: 1 });
  });

  it("separates being the subject of an article from merely being named in one", () => {
    const graph = buildCoMentions(
      [article({ subject: "크립토랩", title: "크립토랩·옥타코 협력" })],
      REGISTRY,
    );

    expect(graph.nodes.find((node) => node.name === "옥타코")).toMatchObject({
      articles: 1,
      asSubject: 0,
    });
    expect(graph.nodes.find((node) => node.name === "크립토랩")).toMatchObject({ asSubject: 1 });
  });

  it("returns an empty graph when nothing has been analysed yet", () => {
    expect(buildCoMentions([], REGISTRY)).toEqual({ nodes: [], edges: [], articles: [] });
  });

  it("lists the articles newest first, because a committee reads the latest news", () => {
    const graph = buildCoMentions(
      [
        article({ link: "https://n/1", published: "2026-05-02" }),
        article({ link: "https://n/2", published: "2026-07-14" }),
        article({ link: "https://n/3", published: "2026-06-28" }),
      ],
      REGISTRY,
    );

    expect(graph.articles.map((entry) => entry.link)).toEqual([
      "https://n/2",
      "https://n/3",
      "https://n/1",
    ]);
  });

  it("names only the companies the article is actually about", () => {
    const graph = buildCoMentions(
      [article({ title: "협력", content: "크립토랩 크립토랩 크립토랩과 옥타코가 손잡았다." })],
      REGISTRY,
    );

    expect(graph.articles[0].companies).toEqual(["크립토랩"]);
  });

  it("keeps one row per article even when two companies collected it", () => {
    const graph = buildCoMentions(
      [
        article({ subject: "크립토랩", link: "https://n/1", title: "크립토랩과 옥타코" }),
        article({ subject: "옥타코", link: "https://n/1", title: "크립토랩과 옥타코" }),
      ],
      REGISTRY,
    );

    expect(graph.articles).toHaveLength(1);
  });

  it("drops an article that is about no registered company", () => {
    const graph = buildCoMentions(
      [article({ title: "업계 동향", content: "삼성전자가 발표했다." })],
      REGISTRY,
    );

    expect(graph.articles).toEqual([]);
  });

  it("puts an article with no date at the end rather than at the top", () => {
    const graph = buildCoMentions(
      [
        article({ link: "https://n/1", published: "" }),
        article({ link: "https://n/2", published: "2026-07-14" }),
      ],
      REGISTRY,
    );

    expect(graph.articles.map((entry) => entry.link)).toEqual(["https://n/2", "https://n/1"]);
  });

  it("counts a registered name the article writes without its space", () => {
    const graph = buildCoMentions(
      [article({ title: "크립토랩·코난테크놀로지 협력" })],
      [...REGISTRY, "코난 테크놀로지"],
    );

    expect(graph.nodes.map((node) => node.name)).toContain("코난 테크놀로지");
    expect(graph.edges[0]).toMatchObject({ a: "코난 테크놀로지", b: "크립토랩" });
  });
});
