import { prisma } from "@/lib/db";

export type SubmissionRow = {
  id: number;
  filename: string;
  storedPath: string;
  sha256: string;
  size: number;
  note: string | null;
  submittedAt: string;
  submittedBy: number;
};

function toRow(row: { id: number; filename: string; storedPath: string; sha256: string; size: number; note: string | null; submittedAt: Date; submittedBy: number }): SubmissionRow {
  return { ...row, submittedAt: row.submittedAt.toISOString() };
}

/**
 * 제출 자료를 해시와 함께 기록한다 — 나중에 "그때 낸 파일이 이것"임을 증명하는 근거다.
 */
export async function createSubmission(input: { filename: string; storedPath: string; sha256: string; size: number; note: string | null; userId: number }): Promise<SubmissionRow> {
  const row = await prisma.submission.create({
    data: { filename: input.filename, storedPath: input.storedPath, sha256: input.sha256, size: input.size, note: input.note, submittedBy: input.userId },
  });
  return toRow(row);
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const rows = await prisma.submission.findMany({ orderBy: [{ submittedAt: "desc" }, { id: "desc" }] });
  return rows.map(toRow);
}
