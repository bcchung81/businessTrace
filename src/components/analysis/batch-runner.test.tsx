import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { BatchRunner, type BatchCandidate } from "@/components/analysis/batch-runner";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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

function openStream() {
  let close: () => void = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "batch_start", total: 1, stage: "full" })}\n\n`));
      close = () => controller.close();
    },
  });
  return { response: new Response(body, { status: 200 }), close: () => close() };
}

function api(events: unknown[] | (() => Response)) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/analyze/batch" && init?.method === "POST") return Response.json({ batch: { stage: "full", total: 1 } }, { status: 202 });
    if (url === "/api/analyze/batch/abort") return Response.json({ aborting: true });
    return typeof events === "function" ? events() : sse(events);
  });
}

describe("BatchRunner", () => {
  beforeEach(() => refresh.mockClear());

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
    const fetchImpl = api([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_event", companyId: 1, event: { type: "progress", step: "trend", current: 2, total: 5 } },
      { type: "company_done", companyId: 1, status: "verified", articles: 5 },
      { type: "batch_done", done: 1, total: 1, aborted: false },
    ]);
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
    expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/batch/events", expect.objectContaining({ cache: "no-store" }));
    const steps = within(screen.getByRole("list", { name: "파이프라인 단계" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps[0]).toContain("수집");
    expect(steps[3]).toContain("리포트");
    await waitFor(() => expect(screen.getByRole("row", { name: /㈜가/ })).toHaveTextContent("검증 통과"));
    expect(screen.getByRole("log")).toHaveTextContent("㈜가 · 검증 통과 · 기사 5건");
    expect(screen.queryByRole("button", { name: "중단" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("resumes a running batch on mount without a click", async () => {
    const fetchImpl = api([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
    ]);
    render(<BatchRunner candidates={CANDIDATES} resume="running" fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
    expect(fetchImpl).not.toHaveBeenCalledWith("/api/analyze/batch", expect.objectContaining({ method: "POST" }));
  });

  test("중단 asks the server to stop and keeps reading until batch_done", async () => {
    const fetchImpl = api([
      { type: "batch_start", total: 2, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_done", companyId: 1, status: "verified" },
      { type: "batch_done", done: 1, total: 2, aborted: true },
    ]);
    render(<BatchRunner candidates={CANDIDATES} resume="running" fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByText("중단됨")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  test("replaying a finished batch does not refresh the page", async () => {
    const fetchImpl = api([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "company_start", companyId: 1, name: "㈜가", index: 0 },
      { type: "company_done", companyId: 1, status: "verified", articles: 3 },
      { type: "batch_done", done: 1, total: 1, aborted: false },
    ]);
    render(<BatchRunner candidates={CANDIDATES} resume="finished" fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByRole("row", { name: /㈜가/ })).toHaveTextContent("검증 통과"));
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("shows 중단 alone while streaming and asks the server to stop on click", async () => {
    const stream = openStream();
    const fetchImpl = api(() => stream.response);
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "실행" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith("/api/analyze/batch/abort", expect.objectContaining({ method: "POST" })));
    expect(screen.getByRole("button", { name: "중단 요청됨" })).toBeDisabled();
    stream.close();
    await waitFor(() => expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument());
  });

  test("blocks a second 실행 while the start request is still in flight", async () => {
    const stream = openStream();
    let accept: () => void = () => {};
    const accepted = new Promise<void>((resolve) => {
      accept = resolve;
    });
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/analyze/batch" && init?.method === "POST") {
        await accepted;
        return Response.json({ batch: { stage: "full", total: 1 } }, { status: 202 });
      }
      return stream.response;
    });
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);

    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    expect(screen.queryByRole("button", { name: "실행" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    accept();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  });

  test("a failed start hands the 실행 button back", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: "실행할 기업이 없습니다." }, { status: 400 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("실행할 기업이 없습니다."));
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("a subscription that was replaced does not clear the busy flag of the one that replaced it", async () => {
    const streams = [openStream(), openStream()];
    let open: () => void = () => {};
    const opened = new Promise<void>((resolve) => {
      open = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      const stream = streams.shift()!;
      if (streams.length === 1) await opened;
      return stream.response;
    });
    const runner = (resume?: "running" | "finished") => <BatchRunner candidates={CANDIDATES} resume={resume} fetchImpl={fetchImpl as unknown as typeof fetch} />;
    const { rerender } = render(runner("running"));
    rerender(runner(undefined));
    rerender(runner("running"));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    open();
    await waitFor(() => expect(streams).toHaveLength(0));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행" })).not.toBeInTheDocument();
  });

  test("a rejected start request hands the 실행 button back with the reason", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("네트워크가 끊겼습니다");
    });
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("네트워크가 끊겼습니다"));
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("a refused 중단 rolls the button back and says so", async () => {
    const stream = openStream();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/analyze/batch" && init?.method === "POST") return Response.json({ batch: { stage: "full", total: 1 } }, { status: 202 });
      if (url === "/api/analyze/batch/abort") return Response.json({ message: "unauthorized" }, { status: 401 });
      return stream.response;
    });
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "중단" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "중단" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("중단 요청 실패 (401)"));
    expect(screen.getByRole("button", { name: "중단" })).toBeEnabled();
  });

  test("a failed events subscription surfaces a message and hands the 실행 button back", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/analyze/batch" && init?.method === "POST") return Response.json({ batch: { stage: "full", total: 1 } }, { status: 202 });
      return Response.json({ message: "unauthorized" }, { status: 401 });
    });
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("진행 상태를 읽지 못했습니다 (401)"));
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("a batch-level error lands in the log and releases the 실행 button", async () => {
    const fetchImpl = api([
      { type: "batch_start", total: 1, stage: "full" },
      { type: "error", message: "배치 실패" },
    ]);
    render(<BatchRunner candidates={CANDIDATES} resume="running" fetchImpl={fetchImpl as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent("배치 실패"));
    expect(screen.getByRole("button", { name: "실행" })).toBeInTheDocument();
  });

  test("surfaces a 409 as a message instead of a stepper", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: "이미 실행 중입니다 · 3개사" }, { status: 409 }));
    render(<BatchRunner candidates={CANDIDATES} preselected={[1]} fetchImpl={fetchImpl as unknown as typeof fetch} />);
    fireEvent.click(screen.getByRole("button", { name: "실행" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("이미 실행 중입니다 · 3개사"));
  });
});
