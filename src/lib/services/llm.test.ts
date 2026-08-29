import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createLlmClient, resolveModel, LlmRefusalError, LlmParseError } from "@/lib/services/llm";

type StreamArgs = Record<string, unknown>;

function fakeSdk(final: unknown) {
  const stream = vi.fn((args: StreamArgs) => ({ args, finalMessage: async () => final }));
  return { sdk: { messages: { stream } } as never, stream };
}

function textMessage(text: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 30 },
  };
}

const schema = z.object({ score: z.number() });

describe("resolveModel", () => {
  it("defaults to Sonnet 5 when the environment does not pin a model", () => {
    expect(resolveModel({})).toBe("claude-sonnet-5");
  });

  it("lets the environment pin a different model in one place", () => {
    expect(resolveModel({ ANTHROPIC_MODEL: "claude-opus-5" })).toBe("claude-opus-5");
  });
});

describe("createLlmClient", () => {
  it("returns the parsed object and the token usage behind it", async () => {
    const { sdk } = fakeSdk(textMessage('{"score":7}'));

    const result = await createLlmClient(sdk).json({ system: "s", prompt: "p", schema });

    expect(result.data).toEqual({ score: 7 });
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40, cacheReadTokens: 30 });
  });

  it("never sends sampling parameters that Sonnet 5 rejects", async () => {
    const { sdk, stream } = fakeSdk(textMessage('{"score":1}'));

    await createLlmClient(sdk).json({ system: "s", prompt: "p", schema });

    const args = stream.mock.calls[0][0] as StreamArgs;
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("top_p");
    expect(args).not.toHaveProperty("top_k");
  });

  it("asks for adaptive thinking and caches the system prompt", async () => {
    const { sdk, stream } = fakeSdk(textMessage('{"score":1}'));

    await createLlmClient(sdk).json({ system: "판정 규칙", prompt: "p", schema });

    const args = stream.mock.calls[0][0] as StreamArgs;
    expect(args.thinking).toEqual({ type: "adaptive" });
    expect(args.system).toEqual([
      { type: "text", text: "판정 규칙", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("puts a shared context ahead of the task as its own cached block", async () => {
    const { sdk, stream } = fakeSdk(textMessage('{"score":1}'));

    await createLlmClient(sdk).json({ system: "s", context: "기사 본문", prompt: "판정해", schema });

    const args = stream.mock.calls[0][0] as StreamArgs;
    expect(args.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "기사 본문", cache_control: { type: "ephemeral" } },
          { type: "text", text: "판정해" },
        ],
      },
    ]);
  });

  it("keeps a plain string message when there is no context", async () => {
    const { sdk, stream } = fakeSdk(textMessage('{"score":1}'));

    await createLlmClient(sdk).json({ system: "s", prompt: "p", schema });

    const args = stream.mock.calls[0][0] as StreamArgs;
    expect(args.messages).toEqual([{ role: "user", content: "p" }]);
  });

  it("carries the requested effort through to the request", async () => {
    const { sdk, stream } = fakeSdk(textMessage('{"score":1}'));

    await createLlmClient(sdk).json({ system: "s", prompt: "p", schema, effort: "low" });

    const args = stream.mock.calls[0][0] as StreamArgs & { output_config?: { effort?: string } };
    expect(args.output_config?.effort).toBe("low");
  });

  it("raises a refusal error instead of returning empty analysis", async () => {
    const { sdk } = fakeSdk({
      stop_reason: "refusal",
      content: [],
      usage: { input_tokens: 5, output_tokens: 0 },
    });

    await expect(createLlmClient(sdk).json({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(
      LlmRefusalError,
    );
  });

  it("raises a parse error when the model answers with prose", async () => {
    const { sdk } = fakeSdk(textMessage("죄송합니다, 분석할 수 없습니다."));

    await expect(createLlmClient(sdk).json({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(
      LlmParseError,
    );
  });

  it("raises a parse error when valid JSON does not match the schema", async () => {
    const { sdk } = fakeSdk(textMessage('{"score":"일곱"}'));

    await expect(createLlmClient(sdk).json({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(
      LlmParseError,
    );
  });

  it("tolerates a fenced code block around the JSON", async () => {
    const { sdk } = fakeSdk(textMessage('```json\n{"score":3}\n```'));

    const result = await createLlmClient(sdk).json({ system: "s", prompt: "p", schema });

    expect(result.data).toEqual({ score: 3 });
  });
});
