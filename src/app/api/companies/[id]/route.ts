import { z } from "zod";
import { auth } from "@/auth";
import { deactivateCompany, updateCompany } from "@/lib/repositories/companyRepository";

const patchSchema = z.object({
  name: z.string().optional(),
  year: z.number().int().optional(),
  businessNo: z.string().nullish(),
  industry: z.string().nullish(),
});

export async function PATCH(request: Request, context: RouteContext<"/api/companies/[id]">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ message: "잘못된 요청입니다." }, { status: 400 });

  const result = await updateCompany(Number(id), parsed.data);
  if (!result.ok) return Response.json({ message: result.message }, { status: 409 });
  return Response.json({ company: result.company });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/companies/[id]">) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const result = await deactivateCompany(Number(id));
  if (!result.ok) return Response.json({ message: result.message }, { status: 404 });
  return Response.json({ company: result.company });
}
