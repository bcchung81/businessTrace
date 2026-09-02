"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pager, paginate } from "@/components/ui/pager";
import type { CompanyModel } from "@/generated/prisma/models";

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return "미확인";
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

export function CompanyTable({
  companies,
  onSetActive,
}: {
  companies: CompanyModel[];
  onSetActive?: (input: { companyId: number; isActive: boolean }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  if (companies.length === 0) {
    return (
      <div className="border border-dashed border-hairline bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">등록된 기업이 없습니다.</p>
      </div>
    );
  }

  const unverifiable = companies.filter((company) => !company.businessNo).length;
  const { slice, pages, current } = paginate(companies, page);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto border-t-2 border-ink bg-background">
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
            {slice.map((company) => (
              <tr
                key={company.id}
                className="border-b border-hairline last:border-0 hover:bg-surface"
              >
                <td className="px-4 py-2.5 font-medium">
                  <Link
                    href={`/companies/${company.id}`}
                    className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {company.name}
                  </Link>
                </td>
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
                  <span className={company.isActive ? "text-foreground" : "text-muted-foreground"}>{company.isActive ? "분석 대상" : "제외"}</span>
                  {onSetActive ? (
                    <button
                      type="button"
                      aria-label={`${company.name} ${company.isActive ? "제외" : "복귀"}`}
                      onClick={async () => {
                        setError(null);
                        const result = await onSetActive({ companyId: company.id, isActive: !company.isActive });
                        if (result.ok) router.refresh();
                        else setError(result.message ?? null);
                      }}
                      className="ml-2 border-[1.5px] border-hairline px-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      {company.isActive ? "제외" : "복귀"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager current={current} pages={pages} onPage={setPage} />

      {error ? <p role="alert" className="text-[12px] font-medium text-risk">{error}</p> : null}

      {unverifiable > 0 ? (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-review">사업자번호 미확인 {unverifiable}개사</span>는 국세청 휴폐업·DART
          재무와 대조할 수 없어 뉴스 외 근거를 확보하지 못합니다.
        </p>
      ) : null}
    </div>
  );
}
