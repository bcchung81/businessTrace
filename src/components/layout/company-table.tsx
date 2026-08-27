import type { CompanyModel } from "@/generated/prisma/models";

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return "미확인";
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

export function CompanyTable({ companies }: { companies: CompanyModel[] }) {
  if (companies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">등록된 기업이 없습니다.</p>
      </div>
    );
  }

  const unverifiable = companies.filter((company) => !company.businessNo).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">등록된 분석 대상 기업 목록</caption>
          <thead>
            <tr className="border-b border-hairline text-left">
              <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">
                기업명
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">
                사업자번호
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">
                산업
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">
                상태
              </th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr
                key={company.id}
                className="border-b border-hairline last:border-0 hover:bg-surface"
              >
                <td className="px-4 py-2.5 font-medium">{company.name}</td>
                <td className="px-4 py-2.5">
                  {company.businessNo ? (
                    <span className="font-mono text-[12.5px]">
                      {formatBusinessNo(company.businessNo)}
                    </span>
                  ) : (
                    <span className="text-review underline decoration-dotted underline-offset-4">
                      미확인
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {company.industry ?? "미분류"}
                </td>
                <td className="px-4 py-2.5">
                  {company.isActive ? (
                    <span className="text-foreground">분석 대상</span>
                  ) : (
                    <span className="text-muted-foreground">제외</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unverifiable > 0 ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-review">사업자번호 미확인 {unverifiable}개사</span>는 국세청 휴폐업·DART
          재무와 대조할 수 없어 뉴스 외 근거를 확보하지 못합니다.
        </p>
      ) : null}
    </div>
  );
}
