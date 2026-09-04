import type { Lookup } from "@/lib/services/outboundUrl";

export type NewsProvider = "naver" | "google";

export type Relevance = "primary" | "mention" | "unrelated";

export type NewsItem = {
  title: string;
  link: string;
  description: string;
  content: string;
  published: string;
  source: string;
  /** RSS 가 준 출처 사이트 주소. 구글 링크가 복원되지 않을 때 출처 도메인을 알 유일한 단서다. */
  sourceUrl?: string;
  provider: NewsProvider;
  titleMatch: boolean;
  mentions: number;
  relevance: Relevance;
};

export type FetchDeps = { fetchImpl?: typeof fetch; lookup?: Lookup };
