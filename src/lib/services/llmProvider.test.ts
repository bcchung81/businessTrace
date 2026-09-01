import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, resolveModel, resolveProvider } from "@/lib/services/llmProvider";

describe("resolveProvider", () => {
  it("stays on anthropic when nothing is set — swapping providers must be deliberate", () => {
    expect(resolveProvider({})).toBe("anthropic");
  });

  it("switches to openai when asked", () => {
    expect(resolveProvider({ LLM_PROVIDER: "openai" })).toBe("openai");
    expect(resolveProvider({ LLM_PROVIDER: "OpenAI" })).toBe("openai");
  });

  it("refuses a provider it cannot serve instead of falling back silently", () => {
    expect(() => resolveProvider({ LLM_PROVIDER: "gemini" })).toThrow(/gemini/);
  });
});

describe("resolveModel", () => {
  it("gives each provider its own default", () => {
    expect(resolveModel({})).toBe(DEFAULT_MODEL.anthropic);
    expect(resolveModel({ LLM_PROVIDER: "openai" })).toBe(DEFAULT_MODEL.openai);
  });

  it("lets the active provider's model variable win", () => {
    expect(resolveModel({ ANTHROPIC_MODEL: "claude-opus-5" })).toBe("claude-opus-5");
    expect(resolveModel({ LLM_PROVIDER: "openai", OPENAI_MODEL: "gpt-5.4-mini" })).toBe("gpt-5.4-mini");
  });

  it("ignores the other provider's model variable — a stale key must not leak across", () => {
    expect(resolveModel({ LLM_PROVIDER: "openai", ANTHROPIC_MODEL: "claude-opus-5" })).toBe(DEFAULT_MODEL.openai);
  });
});
