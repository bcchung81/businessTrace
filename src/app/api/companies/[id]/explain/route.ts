import { auth } from "@/auth";
import { buildExplanation } from "@/lib/repositories/explainInputs";

export async function GET(_request: Request, context: RouteContext<"/api/companies/[id]/explain">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const explanation = await buildExplanation(Number(id));
  if (!explanation) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(explanation);
}
