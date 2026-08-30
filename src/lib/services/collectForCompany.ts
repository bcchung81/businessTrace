import { collectNews, type CollectOptions, type CollectResult } from "@/lib/services/newsCollector";

/**
 * 별칭 칸의 JSON 을 읽는다. 깨진 값은 빈 목록이다 — 별칭 때문에 수집이 멈추면 안 된다.
 */
export function parseAliases(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
      : [];
  } catch {
    return [];
  }
}

/**
 * 회사명과 별칭을 차례로 검색해 링크 기준으로 합친다. 일반명사 상호는 별칭 없이는 기사가 0건이다.
 */
export async function collectForCompany(
  company: { name: string; aliases: string | null },
  options: Omit<CollectOptions, "query">,
  deps: { collect?: typeof collectNews } = {},
): Promise<CollectResult> {
  const collect = deps.collect ?? collectNews;
  const queries = [company.name, ...parseAliases(company.aliases).filter((alias) => alias !== company.name)];
  const seen = new Set<string>();
  const merged: CollectResult = { items: [], duplicatesRemoved: 0, errors: [], primaryCount: 0, noNews: true };
  for (const query of queries) {
    const result = await collect({ ...options, query });
    merged.duplicatesRemoved += result.duplicatesRemoved;
    merged.errors.push(...result.errors);
    for (const entry of result.items) {
      if (seen.has(entry.link)) {
        merged.duplicatesRemoved += 1;
        continue;
      }
      seen.add(entry.link);
      merged.items.push(entry);
    }
  }
  merged.primaryCount = merged.items.filter((entry) => entry.relevance === "primary").length;
  merged.noNews = merged.items.length === 0;
  return merged;
}
