import Parser from "rss-parser";
import pressMapping from "@/lib/services/pressMapping.json";
import { enrichWithBodies } from "@/lib/services/articleBody";
import { countOccurrences, diceSimilarity } from "@/lib/services/textSimilarity";
import type { FetchDeps, NewsItem, Relevance } from "@/lib/services/newsTypes";

const NAVER_HUB = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const NAVER_PAGE_SIZE = 100;
const NAVER_MAX_START = 1000;
const REQUEST_TIMEOUT_MS = 10000;
const LEAD_RATIO = 0.15;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export class NewsRateLimitError extends Error {}

export type CollectOptions = {
  query: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  naver?: boolean;
  google?: boolean;
  duplicateThreshold?: number;
};

export type CollectResult = {
  items: NewsItem[];
  duplicatesRemoved: number;
  primaryCount: number;
  noNews: boolean;
  errors: string[];
};

function stripHtml(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 기사 링크의 도메인을 언론사 이름으로 바꾼다.
 * 네이버 API 는 언론사명을 주지 않아 도메인으로 역산해야 한다.
 */
export function pressNameFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const table = pressMapping as Record<string, string>;
    return table[host] ?? table[`www.${host}`] ?? host;
  } catch {
    return "알 수 없음";
  }
}

/**
 * 기사가 대상 기업을 다루는지 3등급으로 판정한다.
 * 언급 1회는 대체로 스쳐 지나가는 언급이다. 버리지 않고 등급으로 남긴다.
 */
export function classifyRelevance(input: { title: string; content: string; name: string }) {
  const titleMatch = input.title.includes(input.name);
  const mentions = countOccurrences(input.content, input.name);
  const firstIndex = input.content.indexOf(input.name);
  const inLead =
    firstIndex >= 0 && input.content.length > 0 && firstIndex / input.content.length < LEAD_RATIO;

  let relevance: Relevance = "unrelated";
  if (titleMatch || mentions >= 3 || (mentions >= 2 && inLead)) relevance = "primary";
  else if (mentions >= 1) relevance = "mention";

  return { titleMatch, mentions, relevance };
}

/**
 * 제목이 사실상 같은 기사를 걸러낸다.
 */
export function removeDuplicates(items: NewsItem[], threshold: number) {
  if (threshold <= 0) return { items, removed: 0 };

  const kept: NewsItem[] = [];
  let removed = 0;
  for (const item of items) {
    if (kept.some((existing) => diceSimilarity(existing.title, item.title) >= threshold)) removed += 1;
    else kept.push(item);
  }
  return { items: kept, removed };
}

type NaverItem = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

async function fetchNaver(query: string, fetchImpl: typeof fetch): Promise<NewsItem[]> {
  const collected: NewsItem[] = [];

  for (let start = 1; start <= NAVER_MAX_START; start += NAVER_PAGE_SIZE) {
    const url = new URL(NAVER_HUB);
    url.searchParams.set("query", `"${query}"`);
    url.searchParams.set("display", String(NAVER_PAGE_SIZE));
    url.searchParams.set("start", String(start));
    url.searchParams.set("sort", "sim");

    const response = await fetchImpl(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": process.env.NCP_APIGW_API_KEY_ID ?? "",
        "X-NCP-APIGW-API-KEY": process.env.NCP_APIGW_API_KEY ?? "",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 429) throw new NewsRateLimitError("네이버 API HUB 호출 한도를 초과했습니다.");
    if (!response.ok) throw new Error(`naver ${response.status}`);

    const body = (await response.json()) as { items?: NaverItem[] };
    const page = body.items ?? [];
    if (page.length === 0) break;

    for (const entry of page) {
      const link = entry.originallink || entry.link;
      const description = stripHtml(entry.description);
      collected.push({
        title: stripHtml(entry.title),
        link,
        description,
        content: description,
        published: new Date(entry.pubDate).toISOString(),
        source: pressNameFromUrl(link),
        provider: "naver",
        titleMatch: false,
        mentions: 0,
        relevance: "unrelated",
      });
    }

    if (page.length < NAVER_PAGE_SIZE) break;
  }

  return collected;
}

async function fetchGoogle(query: string, fetchImpl: typeof fetch): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}"`)}&hl=ko&gl=KR&ceid=KR:ko`;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`google ${response.status}`);

  const feed = await new Parser({ customFields: { item: [["source", "sourceRaw"]] } }).parseString(
    await response.text(),
  );

  return feed.items.map((entry) => {
    const description = stripHtml(entry.contentSnippet ?? entry.content);
    const rawSource = (entry as { sourceRaw?: string | { _?: string } }).sourceRaw;
    return {
      title: stripHtml(entry.title).replace(/\s-\s[^-]+$/, ""),
      link: entry.link ?? "",
      description,
      content: description,
      published: entry.isoDate ?? new Date(entry.pubDate ?? Date.now()).toISOString(),
      source: (typeof rawSource === "object" ? rawSource?._ : rawSource) ?? "Google News",
      provider: "google" as const,
      titleMatch: false,
      mentions: 0,
      relevance: "unrelated" as Relevance,
    };
  });
}

const RELEVANCE_RANK: Record<Relevance, number> = { primary: 0, mention: 1, unrelated: 2 };

/**
 * 네이버·구글에서 뉴스를 모아 본문까지 채운 목록을 낸다.
 * sort=sim 을 쓴다. date 정렬은 회사명이 스친 무관한 기사로 상위가 채워진다.
 */
export async function collectNews(
  options: CollectOptions,
  deps: FetchDeps & { concurrency?: number } = {},
): Promise<CollectResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const limit = options.limit ?? 30;
  const threshold = options.duplicateThreshold ?? 0.5;
  const errors: string[] = [];

  const [naverResult, googleResult] = await Promise.allSettled([
    options.naver === false ? Promise.resolve<NewsItem[]>([]) : fetchNaver(options.query, fetchImpl),
    options.google === false ? Promise.resolve<NewsItem[]>([]) : fetchGoogle(options.query, fetchImpl),
  ]);

  if (naverResult.status === "rejected") {
    if (naverResult.reason instanceof NewsRateLimitError) throw naverResult.reason;
    errors.push(`naver: ${String(naverResult.reason)}`);
  }
  if (googleResult.status === "rejected") errors.push(`google: ${String(googleResult.reason)}`);

  let merged = [
    ...(naverResult.status === "fulfilled" ? naverResult.value : []),
    ...(googleResult.status === "fulfilled" ? googleResult.value : []),
  ];

  if (options.startDate) {
    const from = new Date(options.startDate).getTime();
    merged = merged.filter((item) => new Date(item.published).getTime() >= from);
  }
  if (options.endDate) {
    const to = new Date(options.endDate).getTime();
    merged = merged.filter((item) => new Date(item.published).getTime() <= to);
  }

  const deduped = removeDuplicates(merged, threshold);
  const ranked = deduped.items
    .map((item) => ({ ...item, ...classifyRelevance({ ...item, name: options.query }) }))
    .sort(
      (a, b) =>
        RELEVANCE_RANK[a.relevance] - RELEVANCE_RANK[b.relevance] ||
        new Date(b.published).getTime() - new Date(a.published).getTime(),
    )
    .slice(0, limit);

  const enriched = await enrichWithBodies(ranked, deps);
  const items = enriched.map((item) => ({
    ...item,
    ...classifyRelevance({ title: item.title, content: item.content, name: options.query }),
  }));

  const primaryCount = items.filter((item) => item.relevance === "primary").length;

  return {
    items,
    duplicatesRemoved: deduped.removed,
    primaryCount,
    noNews: primaryCount === 0,
    errors,
  };
}
