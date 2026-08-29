import { classifyRelevance } from "@/lib/services/newsCollector";
import { countCompanyMentions } from "@/lib/services/textSimilarity";

export type MentionArticle = {
  subject: string;
  title: string;
  content: string;
  link: string;
  source: string;
  published: string;
};

export type MentionNode = {
  name: string;
  mentions: number;
  articles: number;
  asSubject: number;
};

export type CoMentionEdge = {
  a: string;
  b: string;
  articles: number;
  mentions: number;
  links: string[];
};

export type MentionedArticle = {
  title: string;
  link: string;
  source: string;
  published: string;
  companies: string[];
};

export type CoMentionGraph = {
  nodes: MentionNode[];
  edges: CoMentionEdge[];
  articles: MentionedArticle[];
};

function stamp(published: string) {
  const time = Date.parse(published);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function sortPair(a: string, b: string) {
  return [a, b].sort((left, right) => left.localeCompare(right, "ko"));
}

/**
 * 기사가 다루는 등록 기업 쌍을 세어 관계 그래프를 만든다.
 * LLM 을 쓰지 않는다 - 문자열 일치로만 세므로 모든 엣지가 근거 기사 링크를 갖는다.
 * 스쳐 지나가는 언급은 세지 않는다. "아크릴" 같은 일반 명사가 무관한 기사에 붙어 관계를 지어낸다.
 */
export function buildCoMentions(articles: MentionArticle[], registry: string[]): CoMentionGraph {
  const nodes = new Map<string, MentionNode>();
  const edges = new Map<string, CoMentionEdge>();
  const seenArticles = new Map<string, MentionedArticle>();

  for (const article of articles) {
    const text = `${article.title} ${article.content}`;
    const present: Array<{ name: string; mentions: number }> = [];

    for (const name of registry) {
      const { relevance } = classifyRelevance({ title: article.title, content: article.content, name });
      if (relevance !== "primary") continue;

      const mentions = countCompanyMentions(text, name);
      present.push({ name, mentions });

      const node = nodes.get(name) ?? { name, mentions: 0, articles: 0, asSubject: 0 };
      node.mentions += mentions;
      node.articles += 1;
      if (name === article.subject) node.asSubject += 1;
      nodes.set(name, node);
    }

    if (present.length > 0 && !seenArticles.has(article.link)) {
      seenArticles.set(article.link, {
        title: article.title,
        link: article.link,
        source: article.source,
        published: article.published,
        companies: present
          .map((entry) => entry.name)
          .sort((left, right) => left.localeCompare(right, "ko")),
      });
    }

    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        const left = present[i];
        const right = present[j];
        const [a, b] = sortPair(left.name, right.name);
        const key = `${a}|${b}`;
        const edge = edges.get(key) ?? { a, b, articles: 0, mentions: 0, links: [] };
        edge.articles += 1;
        edge.mentions += left.mentions + right.mentions;
        if (!edge.links.includes(article.link)) edge.links.push(article.link);
        edges.set(key, edge);
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort(
      (left, right) => right.mentions - left.mentions || left.name.localeCompare(right.name, "ko"),
    ),
    edges: [...edges.values()].sort((left, right) => right.articles - left.articles),
    articles: [...seenArticles.values()].sort(
      (left, right) => stamp(right.published) - stamp(left.published),
    ),
  };
}
