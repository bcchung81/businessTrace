import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SeverityMark, trustLabel } from "@/components/dashboard/severity-ui";

describe("SeverityMark", () => {
  test.each([
    ["alert", "경보"],
    ["notice", "주의"],
    ["positive", "긍정"],
    ["info", "정보"],
  ] as const)("labels %s as %s", (severity, label) => {
    render(<SeverityMark severity={severity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("trustLabel", () => {
  test("labels verified and needs_review verification results", () => {
    expect(trustLabel("verified")).toBe("근거 확인");
    expect(trustLabel("needs_review")).toBe("확인 필요");
  });

  test("defaults an unverified value to 실측", () => {
    expect(trustLabel(null)).toBe("실측");
  });

  test("omits the label when measuredLabel is null", () => {
    expect(trustLabel(null, { measuredLabel: null })).toBeNull();
  });
});
