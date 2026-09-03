import { describe, expect, it } from "vitest";
import { clientAddress } from "@/lib/services/clientAddress";

const at = (entries: Record<string, string>) => new Headers(entries);

describe("clientAddress", () => {
  it("takes the last x-forwarded-for entry — the one our own proxy appended", () => {
    expect(clientAddress(at({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("cannot be spoofed by a client that sends its own header", () => {
    expect(clientAddress(at({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientAddress(at({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("gives one shared bucket when no proxy header is present", () => {
    expect(clientAddress(at({}))).toBe("unknown");
  });
});
