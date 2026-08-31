import { mergeDuplicateEvents } from "../src/lib/repositories/eventRepository";

async function main() {
  const { merged, deleted } = await mergeDuplicateEvents();
  console.log(`중복 사건 병합 완료 — ${merged}그룹, ${deleted}건 삭제`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
