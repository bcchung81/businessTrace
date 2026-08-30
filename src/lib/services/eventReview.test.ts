import { describe, expect, it } from "vitest";
import { InvalidTransitionError, transition } from "@/lib/services/eventReview";

describe("transition", () => {
  it.each([
    ["open", "acknowledge", "acknowledged"],
    ["open", "done", "done"],
    ["acknowledged", "done", "done"],
    ["done", "reopen", "open"],
  ] as const)("%s + %s → %s", (from, action, to) => {
    expect(transition(from, action)).toBe(to);
  });

  it.each([["acknowledged", "acknowledge"], ["done", "done"], ["open", "reopen"]] as const)("rejects %s + %s", (from, action) => {
    expect(() => transition(from, action)).toThrow(InvalidTransitionError);
  });
});
