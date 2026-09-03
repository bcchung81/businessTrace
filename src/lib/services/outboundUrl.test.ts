import { describe, expect, it, vi } from "vitest";
import { isPrivateAddress, parsePublicUrl, resolvePublicUrl } from "@/lib/services/outboundUrl";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["203.0.113.10", "8.8.8.8", "172.32.0.1", "2001:4860:4860::8888"])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("parsePublicUrl", () => {
  it("keeps an ordinary article url", () => {
    expect(parsePublicUrl("https://www.yna.co.kr/view/1")?.hostname).toBe("www.yna.co.kr");
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.kr/a",
    "gopher://example.kr/a",
    "http://127.0.0.1:3000/api/health",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "not a url",
  ])("refuses %s", (raw) => {
    expect(parsePublicUrl(raw)).toBeNull();
  });
});

describe("resolvePublicUrl", () => {
  it("refuses a public name that resolves to a private address", async () => {
    const lookup = vi.fn(async () => ["169.254.169.254"]);

    expect(await resolvePublicUrl("http://metadata.example.kr/", lookup)).toBeNull();
    expect(lookup).toHaveBeenCalledWith("metadata.example.kr");
  });

  it("refuses when any resolved address is private — one public answer is not enough", async () => {
    const lookup = vi.fn(async () => ["203.0.113.10", "127.0.0.1"]);

    expect(await resolvePublicUrl("https://mixed.example.kr/a", lookup)).toBeNull();
  });

  it("refuses a name that does not resolve", async () => {
    const lookup = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });

    expect(await resolvePublicUrl("https://nowhere.example.kr/a", lookup)).toBeNull();
  });

  it("passes a name that resolves to public addresses only", async () => {
    const lookup = vi.fn(async () => ["203.0.113.10"]);

    expect((await resolvePublicUrl("https://www.yna.co.kr/view/1", lookup))?.href).toBe(
      "https://www.yna.co.kr/view/1",
    );
  });
});
