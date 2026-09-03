import { z } from "zod";

type Env = Record<string, string | undefined>;

/** 프로덕션에서 하나라도 비면 기동하지 않는다. */
export const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NCP_APIGW_API_KEY_ID",
  "NCP_APIGW_API_KEY",
  "DART_API_KEY",
  "NTS_SERVICE_KEY",
] as const;

const PROVIDER_KEY: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };

const productionSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  NCP_APIGW_API_KEY_ID: z.string().min(1),
  NCP_APIGW_API_KEY: z.string().min(1),
  DART_API_KEY: z.string().min(1),
  NTS_SERVICE_KEY: z.string().min(1),
});

/**
 * 기동 시 환경변수를 한 번에 검사해 빠진 것을 전부 낸다.
 * 조용한 폴백을 막는 자리다 — DATABASE_URL 이 없으면 개발용 DB 로 붙고, LLM_PROVIDER 오타는 첫 요청까지 숨는다.
 */
export function checkEnv(env: Env = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];

  const problems: string[] = [];
  const parsed = productionSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const provider = (env.LLM_PROVIDER ?? "anthropic").trim().toLowerCase();
  const key = PROVIDER_KEY[provider];
  if (!key) problems.push(`LLM_PROVIDER: anthropic 또는 openai 여야 합니다 (지금 "${env.LLM_PROVIDER}")`);
  else if (!env[key]) problems.push(`${key}: LLM_PROVIDER=${provider} 이면 필요합니다`);

  return problems;
}

/**
 * 문제가 있으면 전부 적고 던진다 — 절반만 뜬 서버보다 안 뜬 서버가 낫다.
 */
export function assertEnv(env: Env = process.env) {
  const problems = checkEnv(env);
  if (problems.length === 0) return;
  throw new Error(`환경변수가 준비되지 않았습니다:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
}
