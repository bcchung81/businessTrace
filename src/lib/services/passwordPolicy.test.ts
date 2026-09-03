import { describe, it, expect } from "vitest";
import { checkPasswordStrength } from "@/lib/services/passwordPolicy";

describe("checkPasswordStrength", () => {
  it("rejects an empty password with the legacy message", () => {
    expect(checkPasswordStrength("")).toEqual({
      ok: false,
      message: "비밀번호를 입력해주세요.",
    });
  });

  it("rejects eleven characters and accepts twelve", () => {
    expect(checkPasswordStrength("ab123456789")).toEqual({
      ok: false,
      message: "비밀번호는 최소 12자 이상이어야 합니다.",
    });
    expect(checkPasswordStrength("ab1234567890")).toEqual({ ok: true });
  });

  it("rejects more than 128 characters", () => {
    expect(checkPasswordStrength(`a1${"x".repeat(127)}`)).toEqual({
      ok: false,
      message: "비밀번호는 최대 128자까지 가능합니다.",
    });
  });

  it("rejects a single character class", () => {
    expect(checkPasswordStrength("abcdefghijklmn")).toEqual({
      ok: false,
      message: "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다.",
    });
    expect(checkPasswordStrength("12345678901234")).toEqual({
      ok: false,
      message: "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다.",
    });
  });

  it("accepts any two of letters, digits and symbols", () => {
    expect(checkPasswordStrength("abcdefghijk1")).toEqual({ ok: true });
    expect(checkPasswordStrength("abcdefghijk!")).toEqual({ ok: true });
    expect(checkPasswordStrength("123456789012!")).toEqual({ ok: true });
  });
});
