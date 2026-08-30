import { auth } from "@/auth";
import { readBatch } from "@/lib/services/batchRegistry";

export async function GET() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  return Response.json({ batch: readBatch() });
}
