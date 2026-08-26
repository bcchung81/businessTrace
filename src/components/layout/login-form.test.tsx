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
