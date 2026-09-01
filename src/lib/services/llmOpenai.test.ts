import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOpenAiClient } from "@/lib/services/llmOpenai";
import { LlmParseError, LlmRefusalError } from "@/lib/services/llm";

const schema = z.object({ verdict: z.enum(["Y", "N"]), reason: z.string() });

function sdk(message: Record<string, unknown>, usage: Record<string, unknown> = {}) {
  const create = vi.fn(async (body: Record<string, unknown>) => ({
    _sent: body,
    choices: [{ message }],
    usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 }, ...usage },
  }));
  return { client: { chat: { completions: { create } } }, create };
}

describe("createOpenAiClient", () => {
  it("parses the structured answer and maps usage onto our shape", async () => {
    const { client } = sdk({ content: JSON.stringify({ verdict: "Y", reason: "근거 있음" }) });

    const answer = await createOpenAiClient(client as never, "gpt-5.6-terra").json({
      system: "판정하라",
      prompt: "기사",
      schema,
    });

    expect(answer.data).toEqual({ verdict: "Y", reason: "근거 있음" });
    expect(answer.usage).toEqual({ inputTokens: 120, outputTokens: 30, cacheReadTokens: 100 });
  });

  it("asks for the schema by name so the model cannot answer in prose", async () => {
    const { client, create } = sdk({ content: JSON.stringify({ verdict: "N", reason: "없음" }) });

    await createOpenAiClient(client as never, "gpt-5.6-terra").json({ system: "s", prompt: "p", schema, effort: "low" });

    const body = create.mock.calls[0][0] as unknown as { model: string; reasoning_effort: string; response_format: { type: string } };
    expect(body).toMatchObject({ model: "gpt-5.6-terra", reasoning_effort: "low" });
    expect(body.response_format.type).toBe("json_schema");
  });

  it("puts the shared context ahead of the prompt so prompt caching can catch it", async () => {
    const { client, create } = sdk({ content: JSON.stringify({ verdict: "Y", reason: "r" }) });

    await createOpenAiClient(client as never, "m").json({ system: "s", context: "긴 공유 본문", prompt: "질문", schema });

    const messages = (create.mock.calls[0][0] as unknown as { messages: Array<{ role: string; content: string }> }).messages;
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "user"]);
    expect(messages[1].content).toBe("긴 공유 본문");
  });

  it("raises a refusal as a refusal, not as a parse failure", async () => {
    const { client } = sdk({ refusal: "답할 수 없습니다" });

    await expect(createOpenAiClient(client as never, "m").json({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(LlmRefusalError);
  });

  it("raises a parse error when the answer does not fit the schema", async () => {
    const { client } = sdk({ content: JSON.stringify({ verdict: "MAYBE" }) });

    await expect(createOpenAiClient(client as never, "m").json({ system: "s", prompt: "p", schema })).rejects.toBeInstanceOf(LlmParseError);
  });
});
