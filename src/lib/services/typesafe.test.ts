import { describe, expect, it, vi } from "vitest";
import { createJevClient, defaultJevClient, JEV_ENDPOINT, JevError } from "@/lib/services/typesafe";

const OK = {
  model: "jev-1.13.0",
  answers: {
    about: { type: "noul", noul: 0.91 },
    kind: { type: "choice", choice: "none", confidence: 0.98, probabilities: { none: 0.99, lawsuit: 0.01 } },
    tone: { type: "score", score: 4.2, confidence: 0.7, probabilities: { "3": 0.2, "4": 0.4, "5": 0.4 }, legend: { "4": "약간 긍정" } },
  },
  usage: { input_tokens: 812, output_tokens: 60 },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const QUESTIONS = { about: { type: "noul" as const, instructions: "Is `article` about `company`?" } };

describe("createJevClient", () => {
  it("posts the state, questions and model with a bearer key", async () => {
    const fetchImpl = vi.fn(async () => json(OK));
    const client = createJevClient({ apiKey: "k-1", model: "jev-latest", fetchImpl: fetchImpl as unknown as typeof fetch });

    await client.ask({ company: "크립토랩" }, QUESTIONS);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer k-1");
    expect(JSON.parse(String(init.body))).toEqual({ model: "jev-latest", state: { company: "크립토랩" }, questions: QUESTIONS });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns typed answers, the resolved model and input tokens", async () => {
    const client = createJevClient({ apiKey: "k", fetchImpl: vi.fn(async () => json(OK)) as unknown as typeof fetch });

    const response = await client.ask("state", QUESTIONS);

    expect(response.model).toBe("jev-1.13.0");
    expect(response.inputTokens).toBe(812);
    expect(response.answers.about).toEqual({ type: "noul", noul: 0.91 });
    expect(response.answers.kind).toMatchObject({ type: "choice", choice: "none", confidence: 0.98 });
    expect(response.answers.tone).toMatchObject({ type: "score", score: 4.2 });
  });

  it("retries a rate limit and an overload with growing waits, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ detail: "slow down" }, 429))
      .mockResolvedValueOnce(json({ detail: "overloaded" }, 529))
      .mockResolvedValueOnce(json(OK));
    const waits: number[] = [];
    const client = createJevClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async (ms) => void waits.push(ms) });

    const response = await client.ask("state", QUESTIONS);

    expect(response.answers.about).toEqual({ type: "noul", noul: 0.91 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([500, 1000]);
  });

  it("does not retry a rejected request and reports what the server said", async () => {
    const fetchImpl = vi.fn(async () => json({ detail: "questions.about.type: invalid" }, 422));
    const client = createJevClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });

    await expect(client.ask("state", QUESTIONS)).rejects.toThrow(/422.*questions\.about\.type/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget with the last status", async () => {
    const fetchImpl = vi.fn(async () => json({ detail: "overloaded" }, 529));
    const client = createJevClient({ apiKey: "k", retries: 2, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });

    const failure = await client.ask("state", QUESTIONS).catch((caught: unknown) => caught);

    expect(failure).toBeInstanceOf(JevError);
    expect((failure as JevError).status).toBe(529);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries a network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json(OK));
    const client = createJevClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });

    await expect(client.ask("state", QUESTIONS)).resolves.toMatchObject({ model: "jev-1.13.0" });
  });

  it("rejects an answer outside the declared shape instead of passing it on", async () => {
    const bad = { ...OK, answers: { about: { type: "noul", noul: 1.7 } } };
    const client = createJevClient({ apiKey: "k", fetchImpl: vi.fn(async () => json(bad)) as unknown as typeof fetch });

    await expect(client.ask("state", QUESTIONS)).rejects.toThrow(JevError);
  });
});

describe("defaultJevClient", () => {
  it("refuses to build a client without a key", () => {
    expect(() => defaultJevClient({})).toThrow(/TYPESAFE_API_KEY/);
  });

  it("uses the pinned model from TYPESAFE_MODEL", async () => {
    const fetchImpl = vi.fn(async () => json(OK));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      await defaultJevClient({ TYPESAFE_API_KEY: "k", TYPESAFE_MODEL: "jev-1.13.0" }).ask("state", QUESTIONS);
    } finally {
      vi.unstubAllGlobals();
    }
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).model).toBe("jev-1.13.0");
  });
});
