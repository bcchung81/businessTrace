import type { CompanyModel } from "@/generated/prisma/models";

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return "미확인";
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

export function CompanyTable({ companies }: { companies: CompanyModel[] }) {
  if (companies.length === 0) {
    return <p className="text-sm text-muted-foreground">등록된 기업이 없습니다.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">기업명</th>
          <th className="py-2 font-medium">사업자번호</th>
          <th className="py-2 font-medium">산업</th>
          <th className="py-2 font-medium">상태</th>
        </tr>
      </thead>
      <tbody>
        {companies.map((company) => (
          <tr key={company.id} className="border-b last:border-0">
            <td className="py-2">{company.name}</td>
            <td className="py-2 tabular-nums">{formatBusinessNo(company.businessNo)}</td>
            <td className="py-2">{company.industry ?? "미분류"}</td>
            <td className="py-2">{company.isActive ? "분석 대상" : "제외"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
