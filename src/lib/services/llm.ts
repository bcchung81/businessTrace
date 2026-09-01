import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { z } from "zod";
import { createOpenAiClient } from "@/lib/services/llmOpenai";
import { resolveModel as resolveActiveModel, resolveProvider } from "@/lib/services/llmProvider";

const MAX_TOKENS = 8000;

export type Effort = "low" | "medium" | "high";

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };

export type LlmRequest<T> = {
  system: string;
  /** 같은 재료로 여러 질문을 할 때 앞에 두는 공유 본문 — 캐시 접두로 잡힌다. */
  context?: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: Effort;
};

export type LlmClient = {
  json<T>(request: LlmRequest<T>): Promise<{ data: T; usage: Usage }>;
};

export class LlmRefusalError extends Error {}
export class LlmParseError extends Error {}

/**
 * 활성 공급자의 모델 id 를 결정한다.
 * 모델 지정을 이 함수 한 곳으로 모아 호출부에 흩어지지 않게 한다 — 공급자 분기는 llmProvider 가 안다.
 */
export function resolveModel(env: Record<string, string | undefined> = process.env) {
  return resolveActiveModel(env);
}

type StreamMessage = {
  stop_reason?: string | null;
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
};

type StreamingMessages = {
  messages: { stream(args: Record<string, unknown>): { finalMessage(): Promise<StreamMessage> } };
};

function extractJson(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmParseError("모델 응답에서 JSON 을 찾지 못했습니다.");

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    throw new LlmParseError("모델 응답의 JSON 을 해석하지 못했습니다.");
  }
}

/**
 * adaptive thinking 과 effort 를 받는 세대인지 가른다.
 * Haiku 4.5 이하는 두 파라미터를 400 으로 거부한다 — 모델 id 로 판별해 아예 보내지 않는다.
 */
export function supportsAdaptiveThinking(model: string) {
  return !/haiku-4-5|sonnet-4-5|opus-4-5|claude-3/.test(model);
}

/**
 * 구조화 JSON 응답을 돌려주는 LLM 클라이언트를 만든다.
 * Sonnet 5 가 거부하므로 temperature 를 보내지 않는다. 결정성은 effort 로 조절한다.
 */
export function createLlmClient(sdk: StreamingMessages, model = resolveModel()): LlmClient {
  const reasoning = supportsAdaptiveThinking(model);
  return {
    async json<T>({ system, context, prompt, schema, effort = "medium" }: LlmRequest<T>) {
      const content = context
        ? [
            { type: "text", text: context, cache_control: { type: "ephemeral" } },
            { type: "text", text: prompt },
          ]
        : prompt;
      const message = await sdk.messages
        .stream({
          model,
          max_tokens: MAX_TOKENS,
          ...(reasoning ? { thinking: { type: "adaptive" }, output_config: { effort } } : {}),
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
        })
        .finalMessage();

      if (message.stop_reason === "refusal") {
        throw new LlmRefusalError("모델이 이 요청에 대한 응답을 거부했습니다.");
      }

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      const parsed = schema.safeParse(extractJson(text));
      if (!parsed.success) throw new LlmParseError(parsed.error.message);

      return {
        data: parsed.data,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        },
      };
    },
  };
}

/**
 * 환경변수 자격증명으로 기본 LLM 클라이언트를 만든다 — LLM_PROVIDER 가 어느 어댑터를 쓸지 정한다.
 * 두 어댑터가 같은 LlmClient 를 내므로 호출부(분석·검증)는 어느 쪽인지 알지 못한다.
 */
export function defaultLlmClient(): LlmClient {
  if (resolveProvider() === "openai") {
    return createOpenAiClient(new OpenAI({ maxRetries: 3 }) as never);
  }
  return createLlmClient(new Anthropic({ maxRetries: 3 }) as unknown as StreamingMessages);
}
