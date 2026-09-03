import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SubmissionBox } from "@/components/reports/submission-box";

vi.mock("@/app/(app)/reports/actions", () => ({ submitFileAction: vi.fn(async () => ({ ok: true as const })) }));

describe("SubmissionBox", () => {
  it("lists stored submissions with filename, short hash and date", () => {
    render(
      <SubmissionBox
        submissions={[
          { id: 1, filename: "8월 제출.xlsx", storedPath: "data/submissions/x", sha256: "ab".repeat(32), size: 2048, note: "수정본", submittedAt: "2026-08-30T09:00:00.000Z", submittedBy: 1 },
        ]}
      />,
    );

    expect(screen.getByText("8월 제출.xlsx")).toBeInTheDocument();
    expect(screen.getByText("abababababab")).toBeInTheDocument();
    expect(screen.getByText("수정본")).toBeInTheDocument();
  });

  it("pages twenty submissions at a time", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1, filename: `제출-${index + 1}.xlsx`, storedPath: "data/submissions/x", sha256: "ab".repeat(32),
      size: 1024, note: null, submittedAt: "2026-08-30T09:00:00.000Z", submittedBy: 1,
    }));
    const { container } = render(<SubmissionBox submissions={many} />);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("explains an empty archive", () => {
    render(<SubmissionBox submissions={[]} />);

    expect(screen.getByText(/보관된 제출 자료가 없습니다/)).toBeInTheDocument();
  });
});
