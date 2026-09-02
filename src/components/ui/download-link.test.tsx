import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DownloadLink } from "@/components/ui/download-link";

describe("DownloadLink", () => {
  test("fetches the file, shows 생성 중, saves it under the server's filename", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(["x"]), { headers: { "Content-Disposition": "attachment; filename*=UTF-8''%EC%9B%94%EA%B0%84.xlsx" } }));
    const createObjectURL = vi.fn(() => "blob:1");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<DownloadLink href="/api/reports/monthly?year=2026&month=9" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    expect(screen.getByRole("button")).toHaveTextContent("생성 중…");
    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("월간.xlsx");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("엑셀"));
  });

  test("shows the failure inline", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    render(<DownloadLink href="/x" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("생성 실패 (500)"));
  });
});
