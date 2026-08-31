import { auth } from "@/auth";
import { buildExplanation } from "@/lib/repositories/explainInputs";
import { parseId } from "@/lib/services/routeParams";

export async function GET(_request: Request, context: RouteContext<"/api/companies/[id]/explain">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });
  const companyId = parseId((await context.params).id);
  if (companyId === null) return Response.json({ message: "잘못된 id 입니다." }, { status: 400 });
  const explanation = await buildExplanation(companyId);
  if (!explanation) return Response.json({ message: "기업을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(explanation);
}
