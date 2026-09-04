import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const devAutofill = vi.fn();

vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/services/devAutofill", () => ({ devAutofill: () => devAutofill() }));

const { default: LoginPage } = await import("@/app/login/page");

const open = async (params: Record<string, string> = {}) =>
  render(await LoginPage({ params: Promise.resolve({}), searchParams: Promise.resolve(params) } as never));

describe("/login", () => {
  beforeEach(() => devAutofill.mockReset());

  test("fills the form with whatever the server decided to prefill", async () => {
    devAutofill.mockReturnValue({ email: "admin@kca.kr", password: "Passw0rd!Long1" });

    await open();

    expect(screen.getByLabelText("이메일")).toHaveValue("admin@kca.kr");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("Passw0rd!Long1");
    expect(screen.getByTestId("autofill-notice")).toBeInTheDocument();
  });

  test("leaves the form empty when the server refused to prefill — production takes this path", async () => {
    devAutofill.mockReturnValue(null);

    await open();

    expect(screen.getByLabelText("이메일")).toHaveValue("");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.queryByTestId("autofill-notice")).toBeNull();
  });

  test("still shows the throttle message with a prefill on screen", async () => {
    devAutofill.mockReturnValue({ email: "admin@kca.kr", password: "" });

    await open({ error: "TooManyAttempts", retryAfter: "120" });

    expect(screen.getByRole("alert")).toHaveTextContent("120초");
  });
});
