/**
 * SSE 텍스트 스트림을 이벤트 객체로 끊어 읽는다.
 * 청크는 이벤트 경계에서 잘려 오지 않는다. 남은 조각을 버퍼에 들고 있어야 이벤트를 잃지 않는다.
 */
export function createSseParser() {
  let buffer = "";

  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      const events: unknown[] = [];
      let boundary = buffer.indexOf("\n\n");

      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const payload = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload) continue;

        try {
          events.push(JSON.parse(payload));
        } catch {
          continue;
        }
      }

      return events;
    },
  };
}

type SseController = { enqueue: (chunk: Uint8Array) => void; close: () => void };

const encoder = new TextEncoder();

/**
 * 이벤트를 SSE 프레임으로 내보내되, 소비자가 떠난 뒤에는 아무것도 하지 않는다.
 * 끊긴 컨트롤러에 계속 쓰면 예외가 나고, 그 예외가 실패 처리로 흘러 멀쩡히 끝난 실행이 실패로 기록된다.
 */
export function createSseSink(controller: SseController) {
  let open = true;

  return {
    get open() {
      return open;
    },
    send(event: unknown) {
      if (!open) return;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close() {
      if (!open) return;
      open = false;
      controller.close();
    },
    /** 소비자가 먼저 끊었을 때. 컨트롤러는 이미 닫혀 있으므로 손대지 않는다. */
    drop() {
      open = false;
    },
  };
}
