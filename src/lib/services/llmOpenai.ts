import { z } from "zod";
import { LlmParseError, LlmRefusalError, type LlmClient, type LlmRequest } from "@/lib/services/llm";
import { resolveModel } from "@/lib/services/llmProvider";

const MAX_TOKENS = 8000;

type ChatMessage = { role: "system" | "user"; content: string };
type Completion = {
  choices: Array<{ message: { content?: string | null; refusal?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};
type ChatCompletions = { chat: { completions: { create(body: Record<string, unknown>): Promise<Completion> } } };

/**
 * zod 스키마를 OpenAI 가 받는 JSON Schema 로 옮긴다.
 * strict 는 쓰지 않는다 — 선택 필드를 전부 required 로 요구해 우리 스키마가 깨진다. 검증은 zod 로 한 번 더 한다.
 */
function jsonSchema<T>(schema: z.ZodType<T>) {
  return { name: "result", schema: z.toJSONSchema(schema) as Record<string, unknown>, strict: false };
}

/**
 * OpenAI 로 구조화 JSON 응답을 받는 클라이언트 — Anthropic 어댑터와 같은 인터페이스다.
 * 공유 본문은 별도 user 메시지로 앞에 둔다. OpenAI 는 캐시 지시자가 없고 접두 일치로 자동 캐싱한다.
 */
export function createOpenAiClient(sdk: ChatCompletions, model = resolveModel()): LlmClient {
  return {
    async json<T>({ system, context, prompt, schema, effort = "medium" }: LlmRequest<T>) {
      const messages: ChatMessage[] = [{ role: "system", content: system }];
      if (context) messages.push({ role: "user", content: context });
      messages.push({ role: "user", content: prompt });

      const completion = await sdk.chat.completions.create({
        model,
        messages,
        max_completion_tokens: MAX_TOKENS,
        reasoning_effort: effort,
        response_format: { type: "json_schema", json_schema: jsonSchema(schema) },
      });

      const message = completion.choices[0]?.message;
      if (message?.refusal) throw new LlmRefusalError(message.refusal);

      let raw: unknown;
      try {
        raw = JSON.parse(message?.content ?? "");
      } catch {
        throw new LlmParseError("모델 응답의 JSON 을 해석하지 못했습니다.");
      }

      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new LlmParseError(parsed.error.message);

      return {
        data: parsed.data,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          cacheReadTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        },
      };
    },
  };
}
