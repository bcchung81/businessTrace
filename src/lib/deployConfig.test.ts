import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

function lines(file: string) {
  return read(file)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** 빌드 컨텍스트에서 지워지는 경로들 — 부정(!) 규칙으로 되살린 것은 뺀다. */
function excludedPrefixes() {
  const rules = lines(".dockerignore");
  const revived = new Set(rules.filter((rule) => rule.startsWith("!")).map((rule) => rule.slice(1)));
  return rules.filter((rule) => !rule.startsWith("!") && !rule.includes("*") && !revived.has(rule));
}

/** Dockerfile 이 빌드 컨텍스트에서(=--from 없이) 가져오는 경로들. */
function contextCopies(dockerfile: string) {
  return read(dockerfile)
    .split("\n")
    .filter((line) => /^COPY\s/.test(line.trim()) && !line.includes("--from="))
    .flatMap((line) => line.trim().split(/\s+/).slice(1, -1))
    .filter((source) => source !== "." && !source.startsWith("--"));
}

function composeVolumeTargets(service: string) {
  const source = read("deploy/docker-compose.prod.yml");
  const block = new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  \\S|\\n\\S|$)`).exec(source)?.[1] ?? "";
  return [...block.matchAll(/^\s+- (?:[\w.\-/]+):([\w./-]+)$/gm)].map((match) => match[1]);
}

describe(".dockerignore 와 Dockerfile 이 어긋나지 않는다", () => {
  test("컨텍스트에서 가져오는 모든 경로가 .dockerignore 에 살아 있다", () => {
    const excluded = excludedPrefixes();
    for (const source of contextCopies("deploy/Dockerfile.web")) {
      const head = source.split("/")[0];
      expect(excluded, `${source} 는 빌드 컨텍스트에 없다`).not.toContain(head);
      expect(excluded, `${source} 는 빌드 컨텍스트에 없다`).not.toContain(source);
    }
  });
});

describe("볼륨이 이미지 내용을 가리지 않는다", () => {
  test("web 볼륨 어느 것도 /app/prisma 를 덮지 않는다", () => {
    for (const target of composeVolumeTargets("web")) {
      expect(`${"/app/prisma"}/`.startsWith(`${target}/`), `${target} 가 마이그레이션 디렉터리를 가린다`).toBe(false);
    }
  });

  test("DATABASE_URL 의 파일이 볼륨 안에 있다", () => {
    const url = /DATABASE_URL:\s*"file:([^"]+)"/.exec(read("deploy/docker-compose.prod.yml"))?.[1];
    expect(url).toBeDefined();
    const targets = composeVolumeTargets("web");
    expect(targets.some((target) => url!.startsWith(`${target}/`)), `${url} 이 어느 볼륨에도 담기지 않는다`).toBe(true);
  });
});

describe(".env.example", () => {
  test("git 이 추적하도록 예외가 걸려 있다", () => {
    const rules = lines(".gitignore");
    expect(rules.indexOf("!.env.example")).toBeGreaterThan(rules.indexOf(".env*"));
  });
});

describe("마이그레이션 실행 경로", () => {
  test("web 이미지에는 prisma CLI 가 없고 마이그레이션은 별도 서비스가 돌린다", () => {
    const dockerfile = read("deploy/Dockerfile.web");
    const runner = dockerfile.slice(dockerfile.indexOf("AS runner"));
    expect(runner).not.toMatch(/node_modules\/prisma/);

    const compose = read("deploy/docker-compose.prod.yml");
    expect(compose).toMatch(/migrate:/);
    expect(compose).toMatch(/service_completed_successfully/);
  });
});
