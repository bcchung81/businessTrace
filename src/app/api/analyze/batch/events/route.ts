import { auth } from "@/auth";
import { subscribeBatch } from "@/lib/services/batchRegistry";
import { createSseSink } from "@/lib/services/sse";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const sink = createSseSink(controller);
      const unsubscribe = subscribeBatch((event) => {
        if (event === null) sink.close();
        else sink.send(event);
      });
      cleanup = () => {
        unsubscribe();
        sink.drop();
      };
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
