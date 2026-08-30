"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createSubmission } from "@/lib/repositories/submission";
import { hashAndName, MAX_SUBMISSION_BYTES } from "@/lib/services/submissionUpload";

const STORE_DIR = path.join(process.cwd(), "data", "submissions");

export type SubmitFileResult = { ok: true } | { ok: false; message: string };

/**
 * 제출 파일을 data/submissions 에 저장하고 해시를 기록한다 — 파일 자체는 git 밖이다.
 */
export async function submitFileAction(formData: FormData): Promise<SubmitFileResult> {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return { ok: false, message: "unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "파일을 선택하세요." };
  if (file.size > MAX_SUBMISSION_BYTES) return { ok: false, message: "20MB 이하만 보관합니다." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { sha256, storedName } = hashAndName(buffer, file.name);
  await mkdir(STORE_DIR, { recursive: true });
  const storedPath = path.join("data", "submissions", storedName);
  await writeFile(path.join(process.cwd(), storedPath), buffer);
  const note = String(formData.get("note") ?? "").trim() || null;
  await createSubmission({ filename: file.name, storedPath, sha256, size: file.size, note, userId });
  revalidatePath("/reports");
  return { ok: true };
}
