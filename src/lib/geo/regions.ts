import { gazetteer } from "@/lib/services/regionCode";
import raw from "@/lib/geo/korea-regions.json";

const registry = raw as { source: string; sido: string[]; sigungu: Array<{ sido: string; name: string }> };

export const regionSource = registry.source;

/**
 * 통계청이 인정하는 행정구역 이름표. 원천 주소의 지역 표기를 여기에 맞춰 옮긴다.
 * `npx tsx scripts/fetch-regions.ts` 가 갱신한다 — 개칭·통합이 계속 일어나 손으로 관리할 수 없다.
 */
export const koreaGazetteer = gazetteer(registry.sido, registry.sigungu);
