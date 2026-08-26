import { describe, it, expect } from "vitest";
import { checkPasswordStrength } from "@/lib/services/passwordPolicy";

describe("checkPasswordStrength", () => {
  it("rejects an empty password with the legacy message", () => {
    expect(checkPasswordStrength("")).toEqual({
      ok: false,
      message: "비밀번호를 입력해주세요.",
    });
  });

  it("rejects seven characters and accepts eight", () => {
    expect(checkPasswordStrength("ab12345")).toEqual({
      ok: false,
      message: "비밀번호는 최소 8자 이상이어야 합니다.",
    });
    expect(checkPasswordStrength("ab123456")).toEqual({ ok: true });
  });

  it("rejects more than 128 characters", () => {
    expect(checkPasswordStrength(`a1${"x".repeat(127)}`)).toEqual({
      ok: false,
      message: "비밀번호는 최대 128자까지 가능합니다.",
    });
  });

  it("rejects a single character class", () => {
    expect(checkPasswordStrength("abcdefghij")).toEqual({
      ok: false,
      message: "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다.",
    });
    expect(checkPasswordStrength("1234567890")).toEqual({
      ok: false,
      message: "비밀번호는 영문, 숫자, 특수문자 중 최소 2가지 조합이어야 합니다.",
    });
  });

  it("accepts any two of letters, digits and symbols", () => {
    expect(checkPasswordStrength("abcdefg1")).toEqual({ ok: true });
    expect(checkPasswordStrength("abcdefg!")).toEqual({ ok: true });
    expect(checkPasswordStrength("1234567!")).toEqual({ ok: true });
  });
});
