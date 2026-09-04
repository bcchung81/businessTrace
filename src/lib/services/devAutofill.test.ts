import { describe, expect, it } from "vitest";
import { devAutofill } from "@/lib/services/devAutofill";

const at = (env: Record<string, string | undefined>) => devAutofill(env);

describe("devAutofill in production", () => {
  it("refuses even when both values are set — the login page is the one unauthenticated page", () => {
    expect(at({ NODE_ENV: "production", DEV_AUTOFILL_EMAIL: "a@b.kr", DEV_AUTOFILL_PASSWORD: "Passw0rd!Long1" })).toBeNull();
  });
});

describe("devAutofill outside production", () => {
  it("hands over both values when both are set", () => {
    expect(at({ NODE_ENV: "development", DEV_AUTOFILL_EMAIL: "a@b.kr", DEV_AUTOFILL_PASSWORD: "Passw0rd!Long1" })).toEqual({
      email: "a@b.kr",
      password: "Passw0rd!Long1",
    });
  });

  it("fills the email alone when only the email is set — typing the password is the safer half", () => {
    expect(at({ NODE_ENV: "development", DEV_AUTOFILL_EMAIL: "a@b.kr" })).toEqual({ email: "a@b.kr", password: "" });
  });

  it("trims whitespace that crept into the env file", () => {
    expect(at({ NODE_ENV: "development", DEV_AUTOFILL_EMAIL: "  a@b.kr  " })).toEqual({ email: "a@b.kr", password: "" });
  });

  it("stays quiet when neither is set", () => {
    expect(at({ NODE_ENV: "development" })).toBeNull();
  });

  it("treats a blank value as unset", () => {
    expect(at({ NODE_ENV: "development", DEV_AUTOFILL_EMAIL: "   ", DEV_AUTOFILL_PASSWORD: "" })).toBeNull();
  });
});
