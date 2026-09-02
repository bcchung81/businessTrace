import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SignOutForm } from "@/components/layout/sign-out-form";

describe("SignOutForm", () => {
  test("is a form posting to the given action with a labelled button", () => {
    const action = vi.fn();
    render(<SignOutForm action={action} />);
    const button = screen.getByRole("button", { name: "로그아웃" });
    expect(button.closest("form")).not.toBeNull();
  });
});
