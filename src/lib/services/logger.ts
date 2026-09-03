export type LogLevel = "info" | "warn" | "error";

function plain(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  return value;
}

/**
 * 한 줄짜리 JSON 로그 — 운영자가 컨테이너 로그에서 grep 할 수 있는 유일한 통로다.
 * error 만 stderr 로 보낸다. 직렬화에 실패해도 던지지 않는다 — 로그가 요청을 죽여서는 안 된다.
 */
export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = { ts: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(fields)) payload[key] = plain(value);

  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({ ts: payload.ts, level, event, note: "필드를 직렬화하지 못했습니다" });
  }

  if (level === "error") console.error(line);
  else console.log(line);
}
