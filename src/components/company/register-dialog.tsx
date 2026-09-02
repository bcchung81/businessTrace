"use client";

import { useState } from "react";
import type { CompanyModel } from "@/generated/prisma/models";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CompanyBulkForm } from "@/components/layout/company-bulk-form";
import { CompanyTable } from "@/components/layout/company-table";
import { setCompanyActiveAction } from "@/app/companies/actions";

type Tab = "register" | "manage";
const TAB_LABEL: Record<Tab, string> = { register: "일괄 등록", manage: "등록된 기업" };

/**
 * 기업 등록 다이얼로그 — 일괄 등록 폼과 등록된 기업 관리 표를 탭으로 묶는다.
 */
export function RegisterDialog({
  year,
  companies,
  action,
  notice,
  runHref,
}: {
  year: number;
  companies: CompanyModel[];
  action: (formData: FormData) => void | Promise<void>;
  notice?: string;
  runHref?: string;
}) {
  const [tab, setTab] = useState<Tab>(notice ? "register" : "manage");

  return (
    <Dialog defaultOpen={Boolean(notice)}>
      <DialogTrigger asChild>
        <Button variant="signal">기업 등록</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>기업 등록</DialogTitle>
        </DialogHeader>

        <div role="tablist" aria-label="기업 등록 관리" className="flex gap-1.5 border-b border-hairline pb-2">
          {(Object.keys(TAB_LABEL) as Tab[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => setTab(option)}
              className="border-b-2 border-transparent px-3 py-1.5 text-[13px] font-bold text-muted-foreground aria-selected:border-ink aria-selected:text-foreground"
            >
              {TAB_LABEL[option]}
            </button>
          ))}
        </div>

        {tab === "register" ? (
          <CompanyBulkForm year={year} action={action} notice={notice} runHref={runHref} />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <CompanyTable companies={companies} onSetActive={setCompanyActiveAction} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
