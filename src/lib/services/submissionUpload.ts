import { createHash } from "node:crypto";

export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

/**
 * 내용 해시와 저장용 파일명을 만든다. 앞 12자리 해시 접두사로 동명 파일 충돌을 피한다.
 */
export function hashAndName(buffer: Buffer, filename: string): { sha256: string; storedName: string } {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const safe = filename.replace(/[/\\]/g, "_");
  return { sha256, storedName: `${sha256.slice(0, 12)}-${safe}` };
}
