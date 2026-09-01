import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ThemeToggle } from "@/components/layout/theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });
  afterEach(() => document.documentElement.classList.remove("dark"));

  test("turns the dark class on and remembers the choice", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "화면 테마 전환" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  test("turns it back off and remembers light too — an unset value must not mean system", () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "화면 테마 전환" }));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  test("keeps working when storage refuses — the theme still flips", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("denied");
    };
    try {
      render(<ThemeToggle />);
      fireEvent.click(screen.getByRole("button", { name: "화면 테마 전환" }));
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
