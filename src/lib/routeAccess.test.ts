import { describe, it, expect } from "vitest";
import { isPublicPath } from "@/lib/routeAccess";

describe("isPublicPath", () => {
  it("lets the login page through so unauthenticated users can sign in", () => {
    expect(isPublicPath("/login")).toBe(true);
  });

  it("lets Auth.js callback routes through", () => {
    expect(isPublicPath("/api/auth/callback/credentials")).toBe(true);
    expect(isPublicPath("/api/auth/session")).toBe(true);
  });

  it("protects the dashboard and every analysis route", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/api/analyze")).toBe(false);
    expect(isPublicPath("/api/news")).toBe(false);
  });

  it("does not treat a lookalike prefix as public", () => {
    expect(isPublicPath("/loginhack")).toBe(false);
    expect(isPublicPath("/api/authorize")).toBe(false);
  });
});
