import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DownloadLink } from "@/components/ui/download-link";

describe("DownloadLink", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:1");
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCreateObjectURL === undefined) delete (URL as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
    else URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL === undefined) delete (URL as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
    else URL.revokeObjectURL = originalRevokeObjectURL;
  });

  test("fetches the file, shows 생성 중, saves it under the server's filename", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(["x"]), { headers: { "Content-Disposition": "attachment; filename*=UTF-8''%EC%9B%94%EA%B0%84.xlsx" } }));
    render(<DownloadLink href="/api/reports/monthly?year=2026&month=9" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    expect(screen.getByRole("button")).toHaveTextContent("생성 중…");
    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("월간.xlsx");
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("엑셀"));
  });

  test("appends the anchor before clicking and revokes the object URL after a delay so Firefox/Safari can finish the save", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(async () => new Response(new Blob(["x"])));
      render(<DownloadLink href="/x" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
      fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
      await vi.waitFor(() => expect(click).toHaveBeenCalled());
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(document.body.contains(anchor)).toBe(false);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("shows the failure inline", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 500 }));
    render(<DownloadLink href="/x" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("생성 실패 (500)"));
  });

  test("wraps in a block-level span so a full-width button class resolves", () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(["x"])));
    render(<DownloadLink href="/x" className="w-full" fetchImpl={fetchImpl}>엑셀</DownloadLink>);
    const wrapper = screen.getByRole("button", { name: "엑셀" }).parentElement;
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).not.toHaveClass("inline-flex");
  });
});
