"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/companies/[id]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EditableCompany = { id: number; year: number; name: string; industry: string | null; businessNo: string | null; aliases: string[]; isActive: boolean };

type Actions = {
  edit: (input: { companyId: number; name: string; industry: string; businessNo: string; aliases: string[] }) => Promise<ActionResult>;
  setActive: (input: { companyId: number; isActive: boolean }) => Promise<ActionResult>;
};

function formatBusinessNo(businessNo: string | null) {
  if (!businessNo) return "";
  return `${businessNo.slice(0, 3)}-${businessNo.slice(3, 5)}-${businessNo.slice(5)}`;
}

function splitAliases(raw: string) {
  return raw.split(/[\n,]/).map((alias) => alias.trim()).filter((alias) => alias.length > 0);
}

/**
 * 상세 헤더의 기업 편집 — 이름·업종·사업자번호·검색 별칭·분석 대상 여부를 한 폼에 둔다.
 * 제외는 두 번 눌러야 한다. 되돌릴 수는 있지만 랭킹·배치 대상에서 바로 빠지는 조치라 실수 한 번으로 일어나면 안 된다.
 */
export function EditCompanyDialog({ company, actions }: { company: EditableCompany; actions: Actions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(company.name);
  const [industry, setIndustry] = useState(company.industry ?? "");
  const [businessNo, setBusinessNo] = useState(formatBusinessNo(company.businessNo));
  const [aliases, setAliases] = useState(company.aliases.join(", "));
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setName(company.name);
      setIndustry(company.industry ?? "");
      setBusinessNo(formatBusinessNo(company.businessNo));
      setAliases(company.aliases.join(", "));
      setConfirming(false);
      setMessage(null);
    }
  };

  const run = (work: () => Promise<ActionResult>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: "ok", text: "저장했습니다." });
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="signal-outline" size="sm">기업 편집</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>기업 편집</DialogTitle>
          <DialogDescription>{company.year}년 평가 · 사업자번호를 바꾸면 원천을 바로 다시 조회합니다.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={pending} className="flex flex-col gap-3 border-0 p-0">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name" className="text-[13px]">기업명</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-industry" className="text-[13px]">업종</Label>
              <Input id="edit-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="미분류" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-business-no" className="text-[13px]">사업자번호</Label>
              <Input id="edit-business-no" value={businessNo} onChange={(e) => setBusinessNo(e.target.value)} placeholder="000-00-00000" className="font-mono tabular-nums" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-aliases" className="text-[13px]">검색 별칭</Label>
            <textarea
              id="edit-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              rows={2}
              placeholder="쉼표 또는 줄바꿈으로 구분 — 일반명사·약칭이면 별칭을 더한다"
              className="border-[1.5px] border-hairline bg-transparent px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
            />
          </div>
        </fieldset>
        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "border-l-2 border-risk bg-risk-surface px-3 py-2 text-[12.5px] text-risk" : "border-l-2 border-primary bg-accent px-3 py-2 text-[12.5px] text-accent-foreground"}>
            {message.text}
          </p>
        ) : null}
        <DialogFooter className="sm:justify-between">
          {company.isActive ? (
            confirming ? (
              <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => run(() => actions.setActive({ companyId: company.id, isActive: false }))}>정말 제외</Button>
            ) : (
              <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>분석 대상에서 제외</Button>
            )
          ) : (
            <Button variant="signal-outline" size="sm" disabled={pending} onClick={() => run(() => actions.setActive({ companyId: company.id, isActive: true }))}>분석 대상으로 복귀</Button>
          )}
          <Button variant="signal" size="sm" disabled={pending} onClick={() => run(() => actions.edit({ companyId: company.id, name, industry, businessNo, aliases: splitAliases(aliases) }))}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
