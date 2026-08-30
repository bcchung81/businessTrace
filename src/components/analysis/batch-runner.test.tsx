import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { BatchRunner, type BatchCandidate } from "@/components/analysis/batch-runner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const CANDIDATES: BatchCandidate[] = [
  { id: 1, name: "㈜가", verified: false, hasWarning: true, businessNo: "1" },
  { id: 2, name: "㈜나", verified: true, hasWarning: false, businessNo: null },
  { id: 3, name: "㈜다", verified: true, hasWarning: true, businessNo: "3" },
];

function sse(events: unknown[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("BatchRunner", () => {
  test("quick picks select the right companies", () => {
    render(<BatchRunner candidates={CANDIDATES} />);
    fireEvent.click(screen.getByRole("button", { name: "미분석만" }));
    expect(screen.getByRole("checkbox", { name: "㈜가" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "주의·경보 있는 기업만" }));
    expect(screen.getByRole("checkbox", { name: "㈜다" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "사업자번호 미확보 제외" }));
    expect(screen.getByRole("checkbox", { name: "㈜나" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜가" })).toBeChecked();
  });

  test("defaults the period to the last 90 days, editable", () => {
    render(<BatchRunner candidates={CANDIDATES} />);
    const start = screen.getByLabelText("시작일") as HTMLInputElement;
    expect(start.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByText(/기본 최근 90일/)).toBeInTheDocument();
  });

  test("starts preselected companies checked", () => {
    render(<BatchRunner candidates={CANDIDATES} preselected={[2]} />);
    expect(screen.getByRole("checkbox", { name: "㈜나" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "㈜가" })).not.toBeChecked();
  });

  test("posts the options, then shows the stepper, per-company progress and log; the only primary action while running is 중단", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      sse([
        { type: "batch_start", total: 1, stage: "full" },
        { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
        { type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 2, total: 5 } },
        { type: "company_done", companyId: 1, status: "verified", articles: 5 },
        { type: "batch_done", done: 1, total: 1, aborted: false },
      ]),
    );
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("radio", { name: "수집만" }));
    fireEvent.change(screen.getByLabelText("기사 상한"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "재실행 허용" }));
    fireEvent.click(screen.getByRole("button", { name: "실행" }));

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ companyIds: [1], stage: "news", limit: 50, force: true, naver: true, google: true });
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.now() - Date.parse(body.startDate)).toBeGreaterThan(89 * 86_400_000);

    await waitFor(() => expect(screen.getByRole("list", { name: "파이프라인 단계" })).toBeInTheDocument());
    const steps = within(screen.getByRole("list", { name: "파이프라인 단계" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps[0]).toContain("수집");
    expect(steps[3]).toContain("리포트");
    await waitFor(() => expect(screen.getByRole("row", { name: /㈜가/ })).toHaveTextContent("검증 통과"));
    expect(screen.getByRole("log")).toHaveTextContent("㈜가 · 검증 통과 · 기사 5건");
    expect(screen.queryByRole("button", { name: "중단" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("shows 중단 alone while streaming and aborts on click", async () => {
    let release: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "batch_start", total: 1, stage: "full" })}\n\n`));
        release = () => controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "실행" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument());
  });

  test("surfaces a 409 as a message instead of a stepper", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: "이미 실행 중입니다 · 3개사" }, { status: 409 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이미 실행 중입니다 · 3개사"));
  });
});
