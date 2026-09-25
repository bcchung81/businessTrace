export type AnalyzerKind = "llm" | "jev";

/**
 * 기사 판정을 어느 분석기로 할지 정한다. 기본은 llm — 사람 정답셋 기준 Jev 게이트를 통과하기 전에는 바꾸지 않는다.
 * 모르는 값은 조용히 기본으로 떨어뜨리지 않고 던진다. 오타가 판정 엔진을 바꿔 놓으면 결과로만 드러난다.
 */
export function resolveAnalyzer(env: Record<string, string | undefined> = process.env): AnalyzerKind {
  const raw = (env.ANALYZER ?? "llm").trim().toLowerCase();
  if (raw === "llm" || raw === "jev") return raw;
  throw new Error(`알 수 없는 ANALYZER 입니다: ${env.ANALYZER} (llm 또는 jev)`);
}
