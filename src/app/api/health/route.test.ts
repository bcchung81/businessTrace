import { beforeEach, describe, expect, test } from "vitest";
import { resetDatabase } from "@/lib/test-support/db";
import { GET, checkHealth } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(resetDatabase);

  test("reports ok without a session — the container probe has no cookies", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", database: "up" });
  });

  test("says which part is down instead of a bare 500 when the database is unreachable", async () => {
    const response = await checkHealth(async () => { throw new Error("no such table"); });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded", database: "down" });
  });

  test("keeps the exception text out of an unauthenticated response", async () => {
    const response = await checkHealth(async () => {
      throw new Error("no such table: main.User — file:/app/db/prod.db");
    });

    expect(JSON.stringify(await response.json())).not.toContain("prod.db");
  });
});
