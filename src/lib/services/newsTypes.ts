export type NewsProvider = "naver" | "google";

export type Relevance = "primary" | "mention" | "unrelated";

export type NewsItem = {
  title: string;
  link: string;
  description: string;
  content: string;
  published: string;
  source: string;
  provider: NewsProvider;
  titleMatch: boolean;
  mentions: number;
  relevance: Relevance;
};

export type FetchDeps = { fetchImpl?: typeof fetch };
