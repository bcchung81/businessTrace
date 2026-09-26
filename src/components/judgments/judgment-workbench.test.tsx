import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { JudgmentWorkbench } from "@/components/judgments/judgment-workbench";
import type { JudgmentView } from "@/lib/services/judgments";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

function item(id: number, over: Partial<JudgmentView> = {}): JudgmentView {
  return {
    id,
    companyId: 5,
    companyName: "누아",
    officialName: "주식회사 누아",
    industry: "클라우드",
    ceoName: "서덕진",
    aliases: [],
    title: `누아 기사 ${id}`,
    source: "전자신문",
    published: "2026-09-20",
    link: `https://n/${id}`,
    body: `누아가 ${id}번 제품을 냈다.`,
    origin: "held",
    required: false,
    stratum: null,
    answer: { entity: null, role: null, form: null, about: null, note: null },
    judged: false,
    verdict: null,
    ...over,
  };
}

const VERDICT = "분석기: 보류 · 확신 0.45 · LLM · 실행 #312";

function saver() {
  return vi.fn(async (input: { id: number } & Record<string, unknown>) => {
    const decided = typeof input.about === "string";
    return {
      ok: true as const,
      judgment: item(input.id, { answer: { entity: null, role: null, form: null, about: (input.about as string) ?? null, note: (input.note as string) ?? null }, judged: decided, verdict: decided ? VERDICT : null }),
    };
  });
}

function renderBench(items: JudgmentView[], over: Partial<Parameters<typeof JudgmentWorkbench>[0]> = {}) {
  const save = saver();
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ batch: {} }), { status: 202 }));
  render(<JudgmentWorkbench items={items} reflect={[]} save={save} fetchImpl={fetchImpl as unknown as typeof fetch} {...over} />);
  return { save, fetchImpl };
}

describe("JudgmentWorkbench", () => {
  test("keeps the analyzer's answer hidden until the verdict is saved, then shows it", async () => {
    renderBench([item(1)]);

    expect(screen.queryByText(VERDICT)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /예, 주제 기사/ }));

    expect(await screen.findByText(VERDICT)).toBeInTheDocument();
  });

  test("saves the verdict with the keyboard", async () => {
    const { save } = renderBench([item(1)]);

    fireEvent.keyDown(window, { key: "y" });

    await waitFor(() => expect(save).toHaveBeenCalledWith({ id: 1, about: "yes" }));
  });

  test("ignores shortcut keys while a note is being typed", async () => {
    const { save } = renderBench([item(1)]);
    const note = screen.getByRole("textbox", { name: "메모" });

    note.focus();
    fireEvent.keyDown(note, { key: "y" });
    fireEvent.keyDown(note, { key: "1" });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(save).not.toHaveBeenCalled();
  });

  test("clears the role when the article turns out to be about someone else", async () => {
    const { save } = renderBench([item(1, { answer: { entity: "same", role: "main", form: null, about: null, note: null } })]);

    fireEvent.click(screen.getByRole("radio", { name: /아니오, 다른 대상/ }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ id: 1, entity: "other", role: null }));
  });

  test("lists only unjudged articles by default and everything under 전체", () => {
    renderBench([item(1), item(2, { answer: { entity: null, role: null, form: null, about: "no", note: null }, judged: true, verdict: VERDICT })]);
    const list = screen.getByRole("navigation", { name: "판정할 기사" });

    expect(within(list).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(within(list).getAllByRole("button")).toHaveLength(2);
  });

  test("moves to the next unjudged article with Enter", () => {
    renderBench([item(1), item(2, { answer: { entity: null, role: null, form: null, about: "yes", note: null }, judged: true, verdict: VERDICT }), item(3)]);

    fireEvent.keyDown(window, { key: "Enter" });

    expect(screen.getByRole("heading", { level: 3, name: "누아 기사 3" })).toBeInTheDocument();
  });

  test("marks the company name in the article", () => {
    renderBench([item(1)]);

    const marks = document.querySelectorAll("mark");
    expect([...marks].map((mark) => mark.textContent)).toContain("누아");
  });

  test("says so when the body was not collected", () => {
    renderBench([item(1, { body: "" })]);

    expect(screen.getByText("본문이 수집되지 않았습니다.")).toBeInTheDocument();
  });

  test("puts the pending companies back through the batch with force", async () => {
    const { fetchImpl } = renderBench([item(1)], { reflect: [{ companyId: 5, name: "누아", judged: 2 }] });

    fireEvent.click(screen.getByRole("button", { name: /반영 재분석/ }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/analyze/batch");
    expect(JSON.parse(String(init.body))).toMatchObject({ companyIds: [5], stage: "full", force: true });
    expect(await screen.findByText(/재분석을 시작했습니다/)).toBeInTheDocument();
  });

  test("shows the server's reason when the re-analysis is refused", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "이미 실행 중입니다 · 3개사" }), { status: 409 }));
    renderBench([item(1)], { reflect: [{ companyId: 5, name: "누아", judged: 1 }], fetchImpl: fetchImpl as unknown as typeof fetch });

    fireEvent.click(screen.getByRole("button", { name: /반영 재분석/ }));

    expect(await screen.findByText("이미 실행 중입니다 · 3개사")).toBeInTheDocument();
  });

  test("explains where articles come from when the queue is empty", () => {
    renderBench([]);

    expect(screen.getByText(/판정할 기사가 없습니다/)).toBeInTheDocument();
  });
});
