import { auth } from "@/auth";
import { requestAbort } from "@/lib/services/batchRegistry";

export async function POST() {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  return Response.json({ aborting: requestAbort() });
}
