import { closeBatchStream, publishBatchEvent } from "@/lib/services/batchRegistry";

/**
 * 배치 제너레이터를 끝까지 소비해 레지스트리에 발행한다. 호출자는 기다리지 않는다 — 요청은 202 로 먼저 돌아간다.
 * 예외는 error 이벤트로 바꿔 화면에 닿게 하고, 어떤 경우에도 스트림 끝을 알린다.
 */
export async function launchBatch(source: AsyncIterable<unknown>): Promise<void> {
  try {
    for await (const event of source) publishBatchEvent(event);
  } catch (caught) {
    publishBatchEvent({ type: "error", message: caught instanceof Error ? caught.message : "배치 실패" });
  } finally {
    closeBatchStream();
  }
}
