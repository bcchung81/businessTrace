import { describe, expect, it } from "vitest";
import { checkEnv, REQUIRED_IN_PRODUCTION } from "@/lib/env";

const complete = {
  NODE_ENV: "production",
  DATABASE_URL: "file:/app/db/prod.db",
  AUTH_SECRET: "a".repeat(32),
  LLM_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "sk-ant-x",
  NCP_APIGW_API_KEY_ID: "id",
  NCP_APIGW_API_KEY: "key",
  DART_API_KEY: "dart",
  NTS_SERVICE_KEY: "nts",
};

describe("checkEnv in production", () => {
  it("passes when every required key is present", () => {
    expect(checkEnv(complete)).toEqual([]);
  });

  it("names every missing key at once instead of one per restart", () => {
    const problems = checkEnv({ NODE_ENV: "production" });

    expect(problems.length).toBe(REQUIRED_IN_PRODUCTION.length + 1);
    expect(problems.join(" ")).toContain("DATABASE_URL");
    expect(problems.join(" ")).toContain("AUTH_SECRET");
  });

  it("refuses a DATABASE_URL that was never set — the dev fallback must not reach production", () => {
    expect(checkEnv({ ...complete, DATABASE_URL: undefined }).join(" ")).toContain("DATABASE_URL");
  });

  it("refuses a short AUTH_SECRET", () => {
    expect(checkEnv({ ...complete, AUTH_SECRET: "short" }).join(" ")).toContain("AUTH_SECRET");
  });

  it("rejects an unknown LLM_PROVIDER at boot, not at the first request", () => {
    expect(checkEnv({ ...complete, LLM_PROVIDER: "antropic" }).join(" ")).toContain("LLM_PROVIDER");
  });

  it("asks for the key of the provider actually selected", () => {
    const openai = { ...complete, LLM_PROVIDER: "openai", ANTHROPIC_API_KEY: undefined };

    expect(checkEnv(openai).join(" ")).toContain("OPENAI_API_KEY");
    expect(checkEnv({ ...openai, OPENAI_API_KEY: "sk-x" })).toEqual([]);
  });
});

describe("checkEnv outside production", () => {
  it("stays quiet — development runs on the sqlite fallback on purpose", () => {
    expect(checkEnv({ NODE_ENV: "development" })).toEqual([]);
  });
});
