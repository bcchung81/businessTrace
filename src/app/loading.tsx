/**
 * 절 머리 두 개 자리의 뼈대 — 동향 화면이 쿼리를 도는 동안 탭 클릭이 먹었다는 걸 보인다.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">불러오는 중</span>
      <div className="h-9 w-40 animate-pulse bg-surface" />
      <div className="border-t-4 border-ink pt-2.5">
        <div className="h-6 w-56 animate-pulse bg-surface" />
        <div className="mt-4 h-40 animate-pulse bg-surface" />
      </div>
      <div className="border-t-4 border-ink pt-2.5">
        <div className="h-6 w-48 animate-pulse bg-surface" />
        <div className="mt-4 h-24 animate-pulse bg-surface" />
      </div>
    </div>
  );
}
