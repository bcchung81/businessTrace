import { beforeEach, describe, expect, it, vi } from "vitest";

const reviewEvent = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "7" } })) }));
vi.mock("@/lib/repositories/eventRepository", () => ({ reviewEvent: (...args: unknown[]) => reviewEvent(...args) }));

import { reviewEventAction } from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("reviewEventAction", () => {
  beforeEach(() => reviewEvent.mockReset());

  it("passes null when the note field is absent", async () => {
    await reviewEventAction(form({ id: "3", action: "acknowledge" }));
    expect(reviewEvent).toHaveBeenCalledWith(3, "acknowledge", null, 7);
  });

  it("passes an empty string when the note field is blank", async () => {
    await reviewEventAction(form({ id: "3", action: "note", note: "   " }));
    expect(reviewEvent).toHaveBeenCalledWith(3, "note", "", 7);
  });

  it("passes the trimmed note text", async () => {
    await reviewEventAction(form({ id: "3", action: "done", note: " 담당자 통화 " }));
    expect(reviewEvent).toHaveBeenCalledWith(3, "done", "담당자 통화", 7);
  });
});
