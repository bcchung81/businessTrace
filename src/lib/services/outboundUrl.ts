export type Lookup = (hostname: string) => Promise<string[]>;

const V4_BLOCKS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function toV4(ip: string) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/**
 * 사설·루프백·링크로컬·멀티캐스트 주소인지 본다.
 * 클라우드 메타데이터(169.254.169.254)와 IPv4 매핑 IPv6 도 여기서 걸린다.
 */
export function isPrivateAddress(ip: string): boolean {
  const plain = ip.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();

  const mapped = /^(?:::ffff:)([\d.]+)$/.exec(plain);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = toV4(plain);
  if (v4 !== null) {
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
      return ((v4 ^ toV4(base)!) & mask) === 0;
    });
  }

  if (!plain.includes(":")) return true;
  if (plain === "::1" || plain === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(plain)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(plain)) return true;
  if (/^ff[0-9a-f]{2}:/.test(plain)) return true;
  return false;
}

/**
 * http·https 이고 호스트가 사설 IP 리터럴이 아닌 URL 만 통과시킨다.
 * 이름 뒤에 숨은 사설 주소는 여기서 못 잡는다 — DNS 까지 보려면 resolvePublicUrl 을 쓴다.
 */
export function parsePublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  if (/^\[?[\d.:a-fA-F]+\]?$/.test(url.hostname) && /[.:]/.test(url.hostname)) {
    if (isPrivateAddress(url.hostname)) return null;
  }
  return url;
}

/**
 * 이름을 실제로 풀어 사설 주소를 가리키는지까지 본다.
 * 하나라도 사설이면 버린다 — 공인 주소를 함께 주는 응답으로 우회할 수 있어서는 안 된다.
 */
export async function resolvePublicUrl(raw: string, lookup: Lookup): Promise<URL | null> {
  const url = parsePublicUrl(raw);
  if (!url) return null;

  let addresses: string[];
  try {
    addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    return null;
  }
  if (addresses.length === 0) return null;
  if (addresses.some(isPrivateAddress)) return null;
  return url;
}

/**
 * 기본 DNS 해석기 — 노드의 resolver 를 쓴다. 테스트는 언제나 lookup 을 주입한다.
 */
export async function systemLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const answers = await lookup(hostname, { all: true });
  return answers.map((answer) => answer.address);
}
