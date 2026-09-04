import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoginForm } from "@/components/layout/login-form";

describe("LoginForm", () => {
  it("asks for the email and password the legacy accounts were created with", () => {
    render(<LoginForm callbackUrl="/" />);

    expect(screen.getByLabelText("이메일")).toBeRequired();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
  });

  it("carries the callback url so the user lands where they were headed", () => {
    const { container } = render(<LoginForm callbackUrl="/api/analyze" />);

    expect(container.querySelector('input[name="callbackUrl"]')).toHaveValue("/api/analyze");
  });

  it("shows a failure message without revealing which field was wrong", () => {
    render(<LoginForm callbackUrl="/" error="CredentialsSignin" />);

    expect(screen.getByRole("alert")).toHaveTextContent("이메일 또는 비밀번호가 올바르지 않습니다");
  });

  it("stays quiet when there is no error", () => {
    render(<LoginForm callbackUrl="/" />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("LoginForm test-period prefill", () => {
  it("fills both fields when the server handed over a prefill", () => {
    render(<LoginForm callbackUrl="/" prefill={{ email: "admin@kca.kr", password: "Passw0rd!Long1" }} />);

    expect(screen.getByLabelText("이메일")).toHaveValue("admin@kca.kr");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("Passw0rd!Long1");
  });

  it("says on screen that the prefill is temporary — nobody should forget it is on", () => {
    render(<LoginForm callbackUrl="/" prefill={{ email: "admin@kca.kr", password: "Passw0rd!Long1" }} />);

    expect(screen.getByTestId("autofill-notice")).toHaveTextContent("테스트 기간");
  });

  it("fills only the email when that is all the server sent", () => {
    render(<LoginForm callbackUrl="/" prefill={{ email: "admin@kca.kr", password: "" }} />);

    expect(screen.getByLabelText("이메일")).toHaveValue("admin@kca.kr");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
  });

  it("leaves both fields empty and shows no notice without a prefill", () => {
    render(<LoginForm callbackUrl="/" />);

    expect(screen.getByLabelText("이메일")).toHaveValue("");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.queryByTestId("autofill-notice")).toBeNull();
  });

  it("keeps browser password managers working — the fields keep their autocomplete hints", () => {
    render(<LoginForm callbackUrl="/" />);

    expect(screen.getByLabelText("이메일")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("autocomplete", "current-password");
  });

  it("takes the prefill from the server only — the page must never read env vars itself", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/layout/login-form.tsx"), "utf8");

    expect(source).not.toMatch(/process\.env/);
  });

  it("shows how long to wait when the attempt was throttled", () => {
    render(<LoginForm callbackUrl="/" error="TooManyAttempts" retryAfterSec={120} />);

    expect(screen.getByRole("alert")).toHaveTextContent("120초");
  });
});
