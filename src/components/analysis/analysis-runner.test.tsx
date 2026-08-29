import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AnalysisRunner } from "@/components/analysis/analysis-runner";

const COMPANIES = [
  { id: 1, name: "크립토랩" },
  { id: 2, name: "올림플래닛" },
];

const ANALYSIS = {
  news: { title: "크립토랩 시리즈B 200억 유치", link: "https://n.example/1", source: "전자신문", published: "2026-06-28" },
  isAboutCompany: true,
  trend: { is_about_company: "Y", news_trend_summary: "요약", sentiment_score: 9, sentiment_label: "매우 긍정" },
  award: { is_award_related: "N", award_name: "", award_reason: "" },
  investment: { is_investment_related: "Y", investment_name: "시리즈B", investment_reason: "" },
};

function sseResponse(events: unknown[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function runner(response: Response) {
  const fetchImpl = vi.fn(async () => response) as unknown as typeof fetch;
  render(<AnalysisRunner companies={COMPANIES} fetchImpl={fetchImpl} />);
  return fetchImpl;
}

function start() {
  fireEvent.click(screen.getByRole("button", { name: "분석 실행" }));
}

describe("AnalysisRunner", () => {
  test("posts the chosen company and period to the analysis endpoint", async () => {
    const fetchImpl = runner(sseResponse([]));
    fireEvent.change(screen.getByLabelText("기업"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("기사 상한"), { target: { value: "10" } });

    start();

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/analyze");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ companyId: 2, limit: 10 });
  });

  test("shows the collection result as soon as it streams in", async () => {
    runner(
      sseResponse([
        { type: "collected", runId: 7, duplicatesRemoved: 3, primaryCount: 12, noNews: false, errors: [] },
      ]),
    );

    start();

    expect(await screen.findByText(/중복 3건 제거/)).toBeInTheDocument();
  });

  test("names the step it is on rather than showing a bare spinner", async () => {
    runner(
      sseResponse([
        { type: "collected", runId: 7, duplicatesRemoved: 0, primaryCount: 1, noNews: false, errors: [] },
        { type: "progress", step: "trend", current: 12, total: 24 },
      ]),
    );

    start();

    expect(await screen.findByText("동향분석")).toBeInTheDocument();
    expect(screen.getByText("12 / 24")).toBeInTheDocument();
  });

  test("adds each article to the table as it finishes, not at the end", async () => {
    runner(sseResponse([{ type: "news_done", index: 0, analysis: ANALYSIS }]));

    start();

    const table = await screen.findByRole("table", { name: "기사별 분석 결과" });
    expect(within(table).getByText("크립토랩 시리즈B 200억 유치")).toBeInTheDocument();
    expect(within(table).getByText("+9")).toBeInTheDocument();
  });

  test("ends on the verification verdict", async () => {
    runner(
      sseResponse([
        { type: "verifying", runId: 7 },
        {
          type: "verified",
          runId: 7,
          verification: { status: "verified", faithfulness: 0.92, sourceCoverage: 1, evidenceMatch: 0.47 },
        },
      ]),
    );

    start();

    expect(await screen.findByText("검증 완료")).toBeInTheDocument();
  });

  test("never shows a failed verification as a pass", async () => {
    runner(
      sseResponse([
        { type: "verifying", runId: 7 },
        { type: "verification_failed", runId: 7, message: "judge 응답 오류" },
      ]),
    );

    start();

    expect(await screen.findByText("검토 필요")).toBeInTheDocument();
    expect(screen.queryByText("검증 완료")).not.toBeInTheDocument();
  });

  test("surfaces a rate limit with its reason instead of a blank screen", async () => {
    runner(new Response(JSON.stringify({ message: "네이버 뉴스 호출 한도를 넘었습니다." }), { status: 429 }));

    start();

    expect(await screen.findByRole("alert")).toHaveTextContent("한도");
  });

  test("locks the button while a run is in flight", async () => {
    let release: () => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = () => resolve(sseResponse([]));
    });
    const fetchImpl = vi.fn(() => pending) as unknown as typeof fetch;
    render(<AnalysisRunner companies={COMPANIES} fetchImpl={fetchImpl} />);

    start();

    expect(await screen.findByRole("button", { name: "실행 중…" })).toBeDisabled();
    release();
  });

  test("says there is nothing to analyse when no company is registered", () => {
    render(<AnalysisRunner companies={[]} />);

    expect(screen.getByText(/등록된 기업이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "분석 실행" })).not.toBeInTheDocument();
  });
});

describe("AnalysisRunner cleanup", () => {
  test("aborts the open analysis stream when the screen is left", async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const { unmount } = render(<AnalysisRunner companies={COMPANIES} fetchImpl={fetchImpl} />);
    start();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  test("stops reading rather than reporting an error when the request is aborted", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => {});
      return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    render(<AnalysisRunner companies={COMPANIES} fetchImpl={fetchImpl} />);
    start();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
