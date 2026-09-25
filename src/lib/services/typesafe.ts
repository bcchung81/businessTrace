import { z } from "zod";

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_JEV_MODEL = "jev-latest";

const TIMEOUT_MS = 30_000;
const RETRIES = 4;
const BASE_WAIT_MS = 500;

export type JevInstructions = string | Record<string, unknown>;
export type JevQuestion =
  | { type: "noul"; instructions: JevInstructions; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: JevInstructions; criteria: Record<string, string | null> }
  | { type: "score"; instructions: JevInstructions; criteria: string[] };

const answerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.string(), z.number()),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.string(), z.number()),
  }),
]);

const responseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number() }),
});

export type JevAnswer = z.infer<typeof answerSchema>;
export type JevResponse = { model: string; answers: Record<string, JevAnswer>; inputTokens: number };
export type JevClient = { ask(state: unknown, questions: Record<string, JevQuestion>): Promise<JevResponse> };

export class JevError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

type Deps = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const retryable = (status: number) => status === 429 || status === 529 || status >= 500;

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Jev(System One) 에 state 하나와 독립 질문 묶음을 묻는 클라이언트를 만든다.
 * 429·529·5xx·네트워크 오류는 지수 백오프로 다시 묻고, 요청 자체가 틀린 4xx 는 바로 던진다.
 * 답은 zod 로 한 번 더 검사한다 — 타입 보장은 인터페이스일 뿐이라 범위를 벗어난 값을 하류로 넘기지 않는다.
 */
export function createJevClient(deps: Deps): JevClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retries = deps.retries ?? RETRIES;
  const model = deps.model ?? DEFAULT_JEV_MODEL;

  return {
    async ask(state, questions) {
      const body = JSON.stringify({ model, state, questions });
      let last: JevError = new JevError("Jev 호출이 시작되지 않았습니다.", null);
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (attempt > 0) await sleep(BASE_WAIT_MS * 2 ** (attempt - 1));
        let response: Response;
        try {
          response = await fetchImpl(JEV_ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
            body,
            signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS),
          });
        } catch (caught) {
          last = new JevError(`Jev 호출 실패: ${caught instanceof Error ? caught.message : String(caught)}`, null);
          continue;
        }
        const text = await response.text();
        if (!response.ok) {
          last = new JevError(`Jev ${response.status}: ${text.slice(0, 300)}`, response.status);
          if (retryable(response.status)) continue;
          throw last;
        }
        const parsed = responseSchema.safeParse(parseJson(text));
        if (!parsed.success) throw new JevError(`Jev 응답 형식이 다릅니다: ${parsed.error.message.slice(0, 300)}`, response.status);
        return { model: parsed.data.model, answers: parsed.data.answers, inputTokens: parsed.data.usage.input_tokens };
      }
      throw last;
    },
  };
}

/**
 * 환경변수로 기본 Jev 클라이언트를 만든다. 모델은 TYPESAFE_MODEL 로 고정한다 — 게이트를 통과한 버전이어야 한다.
 */
export function defaultJevClient(env: Record<string, string | undefined> = process.env): JevClient {
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new Error("TYPESAFE_API_KEY 가 없습니다 — ANALYZER=jev 에 필요합니다.");
  return createJevClient({ apiKey, model: env.TYPESAFE_MODEL?.trim() || DEFAULT_JEV_MODEL });
}
