import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

const hooksDir = resolve(__dirname, "../.claude/hooks");

type Outcome = { exit: number; stdout: string; stderr: string };

function runHook(name: string, input: object, env?: NodeJS.ProcessEnv): Outcome {
  const r = spawnSync("/bin/bash", [join(hooksDir, name)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: env ?? process.env,
  });
  return { exit: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

const preWrite = (path: string, env?: NodeJS.ProcessEnv) =>
  runHook("pre-write-guard.sh", { tool_input: { file_path: path } }, env);

const postEdit = (path: string, env?: NodeJS.ProcessEnv) =>
  runHook("post-edit-check.sh", { tool_input: { file_path: path } }, env);

let sandbox: string;

const keyInUrl = (open: string, close: string) =>
  ["const u = ", open, "https://x?serviceKey", "=", close, "\n"].join("");

function fixture(rel: string, body: string): string {
  const p = join(sandbox, rel);
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "hooks-"));
});

describe("pre-write-guard", () => {
  test("blocks python files outside sidecar/ and scripts/", () => {
    expect(preWrite("/repo/root.py").exit).toBe(2);
  });

  test("allows python files under sidecar/ and scripts/", () => {
    expect(preWrite("/repo/sidecar/app.py").exit).toBe(0);
    expect(preWrite("/repo/scripts/x.py").exit).toBe(0);
  });

  test("blocks middleware.ts in favour of proxy.ts", () => {
    expect(preWrite("/repo/src/middleware.ts").exit).toBe(2);
  });

  test("passes ordinary files and empty input", () => {
    expect(preWrite("/repo/src/app/page.tsx").exit).toBe(0);
    expect(runHook("pre-write-guard.sh", { tool_input: {} }).exit).toBe(0);
  });

  test("fails closed when jq is unavailable", () => {
    const r = preWrite("/repo/src/app/page.tsx", { PATH: "/nonexistent" });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("jq");
  });
});

describe("post-edit-check", () => {
  test("blocks serviceKey interpolated into a URL string", () => {
    const tpl = fixture("src/lib/services/a.ts", keyInUrl("`", "${key}`"));
    const cat = fixture("src/lib/services/b.ts", keyInUrl('"', '" + key'));
    expect(postEdit(tpl).exit).toBe(2);
    expect(postEdit(cat).exit).toBe(2);
  });

  test("passes serviceKey set via searchParams", () => {
    const p = fixture("src/lib/services/c.ts", 'u.searchParams.set("serviceKey", key)\n');
    expect(postEdit(p).exit).toBe(0);
  });

  test("warns on legacy naver endpoint via systemMessage", () => {
    const p = fixture("src/lib/services/d.ts", 'const e = "https://openapi.naver.com/v1/search/news.json"\n');
    const r = postEdit(p);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.stdout).systemMessage).toContain("API HUB");
  });

  test("warns on comments inside src/", () => {
    const p = fixture("src/lib/services/e.ts", "// note\nexport const x = 1\n");
    expect(JSON.parse(postEdit(p).stdout).systemMessage).toContain("주석");
  });

  test("passes clean src files, non-code files, and missing files", () => {
    const clean = fixture("src/lib/services/f.ts", "export const x = 1\n");
    const md = fixture("notes.md", "// not code\n");
    expect(postEdit(clean).exit).toBe(0);
    expect(postEdit(md).exit).toBe(0);
    expect(postEdit(join(sandbox, "nope.ts")).exit).toBe(0);
  });

  test("prefers tool_response.filePath over tool_input.file_path", () => {
    const bad = fixture("src/lib/services/g.ts", keyInUrl("`", "${key}`"));
    const good = fixture("src/lib/services/h.ts", "export const x = 1\n");
    const r = runHook("post-edit-check.sh", {
      tool_response: { filePath: bad },
      tool_input: { file_path: good },
    });
    expect(r.exit).toBe(2);
  });

  test("fails closed when jq is unavailable", () => {
    const p = fixture("src/lib/services/i.ts", keyInUrl("`", "${key}`"));
    const r = postEdit(p, { PATH: "/nonexistent" });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("jq");
  });
});

describe("pre-commit-gate", () => {
  const gate = (command: string, env?: NodeJS.ProcessEnv) =>
    runHook("pre-commit-gate.sh", { tool_input: { command } }, env);

  test("ignores bash commands that are not git commit", () => {
    expect(gate("ls -la").exit).toBe(0);
    expect(gate("git status").exit).toBe(0);
    expect(gate("echo 'git commit'").exit).toBe(0);
  });

  test("fails closed when jq is unavailable", () => {
    const r = gate("git commit -m x", { PATH: "/nonexistent" });
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("jq");
  });
});
