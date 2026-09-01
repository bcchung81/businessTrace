export type LlmProvider = "anthropic" | "openai";

/**
 * 공급자별 기본 모델.
 * OpenAI 는 gpt-5.6-terra 다 — 이 제품은 환각 검증이 존재 이유라 judge 를 최저가 칸에 두지 않는다.
 * 대량 기사 분류만 싸게 돌리고 싶으면 OPENAI_MODEL 로 gpt-5.4-mini 를 지정한다.
 */
export const DEFAULT_MODEL: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.6-terra",
};

const MODEL_ENV: Record<LlmProvider, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
};

/**
 * 어느 공급자로 부를지 정한다. 기본은 Anthropic — 갈아타는 것은 의도한 행동이어야 한다.
 * 모르는 값은 조용히 기본으로 떨어뜨리지 않고 던진다. 설정 오타가 공급자를 바꿔 놓으면 청구서로 알게 된다.
 */
export function resolveProvider(env: Record<string, string | undefined> = process.env): LlmProvider {
  const raw = (env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();
  if (raw === "anthropic" || raw === "openai") return raw;
  throw new Error(`알 수 없는 LLM_PROVIDER 입니다: ${env.LLM_PROVIDER}`);
}

/**
 * 활성 공급자의 모델 id 를 정한다 — 분석 실행 기록에 남는 값이라 실제로 부른 모델이어야 한다.
 * 다른 공급자의 모델 변수는 읽지 않는다. 남아 있던 키가 넘어오면 기록이 거짓이 된다.
 */
export function resolveModel(env: Record<string, string | undefined> = process.env): string {
  const provider = resolveProvider(env);
  return env[MODEL_ENV[provider]] || DEFAULT_MODEL[provider];
}
