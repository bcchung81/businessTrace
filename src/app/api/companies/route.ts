import { z } from "zod";
import { auth } from "@/auth";
import { createCompanies, createCompany, listCompanies } from "@/lib/repositories/companyRepository";

const createSchema = z.union([
  z.object({
    name: z.string(),
    year: z.number().int(),
    businessNo: z.string().nullish(),
    industry: z.string().nullish(),
  }),
  z.object({ year: z.number().int(), names: z.array(z.string()) }),
]);

export async function GET(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  if (!Number.isInteger(year)) {
    return Response.json({ message: "year 파라미터가 필요합니다." }, { status: 400 });
  }

  const companies = await listCompanies({
    year,
    includeInactive: params.get("includeInactive") === "true",
  });
  return Response.json({ companies });
}

export async function POST(request: Request) {
  if (!(await auth())?.user) return Response.json({ message: "unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ message: "잘못된 요청입니다." }, { status: 400 });

  if ("names" in parsed.data) {
    return Response.json(await createCompanies(parsed.data), { status: 201 });
  }

  const result = await createCompany(parsed.data);
  if (!result.ok) return Response.json({ message: result.message }, { status: 409 });
  return Response.json({ company: result.company }, { status: 201 });
}
