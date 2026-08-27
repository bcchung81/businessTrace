import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 8000;

export type Effort = "low" | "medium" | "high";

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };

export type LlmRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: Effort;
};

export type LlmClient = {
  json<T>(request: LlmRequest<T>): Promise<{ data: T; usage: Usage }>;
};

export class LlmRefusalError extends Error {}
export class LlmParseError extends Error {}

export function resolveModel(env: Record<string, string | undefined> = process.env) {
  return env.ANTHROPIC_MODEL || DEFAULT_MODEL;
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

export function createLlmClient(sdk: StreamingMessages, model = resolveModel()): LlmClient {
  return {
    async json<T>({ system, prompt, schema, effort = "medium" }: LlmRequest<T>) {
      const message = await sdk.messages
        .stream({
          model,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: prompt }],
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

export function defaultLlmClient() {
  return createLlmClient(new Anthropic({ maxRetries: 3 }) as unknown as StreamingMessages);
}
