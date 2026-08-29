# 대시보드 스킨(Microduck 디자인 언어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/design/2026-08-29-microduck-design-analysis.md` 의 3~5장을 그대로 코드로 옮긴다 — 토큰·유틸리티·Anton, `Panel` 셸, `Button`/`Card`/`Badge` variant, `Ribbon`, 대시보드 헤더 적용.

**Architecture:** shadcn 관례대로 원시값은 `:root`/`.dark`, Tailwind 노출은 `@theme inline`. 컴포넌트는 `cva` variant **추가**만 하고 기존 variant 는 건드리지 않는다. 대시보드는 `Panel` 한 곳과 `page.tsx` 헤더만 바뀐다.

**Tech Stack:** Next.js 16.3 · Tailwind v4 · shadcn/ui(new-york) · `class-variance-authority` · vitest + Testing Library

**Spec:** `docs/design/2026-08-29-microduck-design-analysis.md` (3~5장이 규범)

## Global Constraints

- 주석은 JSDoc 만, 본문 3줄 이내. `//` 줄 주석 금지 (CLAUDE.md)
- 실패 테스트 → 구현 → 통과. 외부 네트워크 테스트 금지
- 상태색은 `verified`·`review`·`risk`·`pending` 의미에만. 강조는 **primary 하나**. 새 강조색 금지
- 표·숫자 열은 기울이지 않는다. 기울임은 `Ribbon` 한 곳(`-rotate-1`)뿐
- Anton 은 한글 글리프가 없다 — `font-display` 는 숫자·영문·대문자 라벨에만. 한글 제목은 Pretendard 유지
- `prefers-reduced-motion: reduce` 에서 마키 정지
- 각 태스크 끝에 `npx tsc --noEmit -p tsconfig.json` 이 깨끗해야 한다(vitest 는 타입 검사를 안 한다)
- 커밋 메시지는 각 태스크 마지막 스텝 그대로

---

### Task 1: 토큰·유틸리티·Anton

**Files:**
- Modify: `src/app/globals.css` (`@theme inline`, `:root`, `.dark`, `@layer utilities`)
- Modify: `src/app/layout.tsx`
- Test: `src/components/dashboard/design-primitives.test.tsx`

**Interfaces:**
- Produces: Tailwind `shadow-hard` `shadow-hard-lg` `shadow-hard-primary` · `border-ink` `bg-ink` `text-ink` · `bg-paper` `bg-paper-2` · `font-display` · 유틸리티 `.paper-grain` `.cut-top` `.cut-top-rl` `.ribbon-drift`. CSS 변수 `--font-anton`.

- [ ] **Step 1: 실패 테스트**

`design-primitives.test.tsx` 의 `describe("status tokens"` 아래에 추가:

```tsx
describe("skin tokens", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  test("defines ink, paper and hard shadows in light and dark", () => {
    for (const selector of [":root", ".dark"]) {
      const block = cssBlock(css, selector);
      for (const token of ["--ink", "--paper", "--paper-2", "--shadow-hard", "--shadow-hard-lg", "--shadow-hard-primary"]) {
        expect(block, `${selector} ${token}`).toMatch(new RegExp(`${token}:\\s*\\S`));
      }
    }
  });

  test("swaps the grey surface for cream paper", () => {
    expect(cssBlock(css, ":root")).toContain("--surface: #faf8f2");
  });

  test("exposes the skin as Tailwind theme keys", () => {
    for (const line of [
      "--color-ink: var(--ink);",
      "--color-paper: var(--paper);",
      "--color-paper-2: var(--paper-2);",
      "--shadow-hard: var(--shadow-hard);",
      "--shadow-hard-lg: var(--shadow-hard-lg);",
      "--shadow-hard-primary: var(--shadow-hard-primary);",
      "--font-display: var(--font-anton)",
    ]) {
      expect(css).toContain(line);
    }
  });

  test("ships the grain, cut and ribbon utilities with reduced-motion off switch", () => {
    for (const rule of [".paper-grain::after", ".cut-top", ".cut-top-rl", "@keyframes ribbon-drift", ".ribbon-drift"]) {
      expect(css).toContain(rule);
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.ribbon-drift\s*\{\s*animation:\s*none/);
  });
});

describe("root layout font", () => {
  const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

  test("self-hosts Anton under --font-anton", () => {
    expect(layout).toContain('from "next/font/google"');
    expect(layout).toMatch(/Anton\(\{[^}]*variable:\s*"--font-anton"/);
    expect(layout).toContain("anton.variable");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/components/dashboard/design-primitives.test.tsx` → FAIL

- [ ] **Step 3: `globals.css`**

`@theme inline` 의 `--color-surface: var(--surface);` 다음에:

```css
  --color-ink: var(--ink);
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --font-display: var(--font-anton), "Pretendard Variable", sans-serif;
  --shadow-hard: var(--shadow-hard);
  --shadow-hard-lg: var(--shadow-hard-lg);
  --shadow-hard-primary: var(--shadow-hard-primary);
```

`:root` 에서 `--surface: #f7f7f8;` 를 교체하고 그 아래 추가:

```css
  --surface: #faf8f2;
  --paper: #faf8f2;
  --paper-2: #f2ecdd;
  --ink: #171719;
  --shadow-hard: 4px 4px 0 var(--ink);
  --shadow-hard-lg: 6px 6px 0 var(--ink);
  --shadow-hard-primary: 6px 6px 0 var(--primary);
```

`.dark` 의 `--surface: #141415;` 아래 추가:

```css
  --paper: #141415;
  --paper-2: #1b1c1e;
  --ink: #f7f7f8;
  --shadow-hard: 4px 4px 0 var(--ink);
  --shadow-hard-lg: 6px 6px 0 var(--ink);
  --shadow-hard-primary: 6px 6px 0 var(--primary);
```

`@layer utilities` 블록 끝(`.hatch` 규칙 뒤)에 추가:

```css
  .paper-grain { position: relative; }
  .paper-grain::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.06;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .cut-top { clip-path: polygon(0 clamp(8px, 1.5vw, 20px), 100% 0, 100% calc(100% + 2px), 0 calc(100% + 2px)); }
  .cut-top-rl { clip-path: polygon(0 0, 100% clamp(8px, 1.5vw, 20px), 100% calc(100% + 2px), 0 calc(100% + 2px)); }
  @keyframes ribbon-drift { to { transform: translate3d(-33.333%, 0, 0); } }
  .ribbon-drift { animation: ribbon-drift 40s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .ribbon-drift { animation: none; } }
```

- [ ] **Step 4: `layout.tsx`**

```tsx
import { Anton, Geist, Geist_Mono } from "next/font/google";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
```

`<html className={...}>` 에 `${anton.variable}` 추가.

- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npx tsc --noEmit -p tsconfig.json` 깨끗, `npm test`
- [ ] **Step 6: 커밋**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/dashboard/design-primitives.test.tsx
git commit -m "feat(skin): ink, paper and hard-shadow tokens with Anton display font"
```

---

### Task 2: `Panel` 셸 교체

**Files:**
- Modify: `src/components/dashboard/panel.tsx`
- Test: `src/components/dashboard/design-primitives.test.tsx`

- [ ] **Step 1: 실패 테스트** — `describe("Panel"` 안에 추가:

```tsx
  test("wears the ink border and hard shadow", () => {
    render(<Panel title="판정 현황"><p>본문</p></Panel>);
    const card = screen.getByText("본문").parentElement?.parentElement;

    expect(card).toHaveClass("border-2", "border-ink", "shadow-hard");
    expect(card).not.toHaveClass("border-border");
  });
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 카드 div 클래스 교체:

```diff
- "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-background shadow-[0_1px_2px_rgba(23,23,25,0.04)]"
+ "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border-2 border-ink bg-background shadow-hard"
```

푸터 `border-t border-border` → `border-t-2 border-ink`.

- [ ] **Step 4: 통과 확인**, tsc, `npm test`
- [ ] **Step 5: 커밋** — `git commit -m "feat(skin): Panel wears ink border and hard shadow"`

---

### Task 3: `Button` `hard` / `hard-outline` / `display`

**Files:**
- Modify: `src/components/ui/button.tsx`
- Test: `src/components/ui/button.test.tsx`

- [ ] **Step 1: 실패 테스트** — 파일 끝 `describe("Button"` 안에 추가:

```tsx
  test("hard variant carries the ink border and hard shadow", () => {
    render(<Button variant="hard">분석 실행</Button>);
    const button = screen.getByRole("button", { name: "분석 실행" });

    expect(button).toHaveClass("border-2", "border-ink", "shadow-hard", "bg-primary");
    expect(button).toHaveAttribute("data-variant", "hard");
  });

  test("hard-outline variant keeps the background plain", () => {
    render(<Button variant="hard-outline">목록으로</Button>);

    expect(screen.getByRole("button", { name: "목록으로" })).toHaveClass("border-ink", "shadow-hard", "bg-background");
  });

  test("display size sets the display face in uppercase", () => {
    render(<Button variant="hard" size="display">RUN</Button>);

    expect(screen.getByRole("button", { name: "RUN" })).toHaveClass("font-display", "uppercase");
  });
```

- [ ] **Step 2: 실패 확인** → FAIL (타입 오류 포함 — tsc 로도 확인)
- [ ] **Step 3: 구현** — `buttonVariants` 의 `variant` 에 추가:

```ts
        hard:
          "border-2 border-ink bg-primary text-primary-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        "hard-outline":
          "border-2 border-ink bg-background text-foreground shadow-hard hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg active:translate-x-1 active:translate-y-1 active:shadow-none",
```

`size` 에 추가:

```ts
        display: "h-11 rounded-md px-6 font-display text-[15px] uppercase tracking-[0.02em]",
```

- [ ] **Step 4: 통과 확인**, tsc, `npm test`
- [ ] **Step 5: 커밋** — `git commit -m "feat(skin): hard and hard-outline button variants with display size"`

---

### Task 4: `Card` `comic`/`paper` + `Badge` `ink`/`stamp`

**Files:**
- Create (via `npx shadcn@latest add card badge --yes`): `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`
- Modify: 위 두 파일에 variant 추가
- Test: `src/components/ui/card.test.tsx`, `src/components/ui/badge.test.tsx`

- [ ] **Step 1: shadcn 추가** — `npx shadcn@latest add card badge --yes`. 생성된 파일을 읽고 `Card` 함수와 `badgeVariants` 위치를 확인한다.
- [ ] **Step 2: 실패 테스트**

`card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card, CardContent } from "@/components/ui/card";

describe("Card", () => {
  test("default keeps the shadcn look", () => {
    render(<Card data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("shadow-sm");
    expect(screen.getByTestId("card")).not.toHaveClass("border-ink");
  });

  test("comic variant draws the ink border and large hard shadow", () => {
    render(<Card variant="comic" data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("border-2", "border-ink", "shadow-hard-lg");
    expect(screen.getByTestId("card")).toHaveAttribute("data-variant", "comic");
  });

  test("paper variant sits on cream with grain", () => {
    render(<Card variant="paper" data-testid="card"><CardContent>본문</CardContent></Card>);

    expect(screen.getByTestId("card")).toHaveClass("bg-paper", "paper-grain", "shadow-hard");
  });
});
```

`badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  test("ink variant is a small hard-shadowed chip", () => {
    render(<Badge variant="ink">실측</Badge>);

    expect(screen.getByText("실측")).toHaveClass("border-2", "border-ink", "shadow-[2px_2px_0_var(--ink)]");
  });

  test("stamp variant is dashed and uppercase", () => {
    render(<Badge variant="stamp">draft</Badge>);

    expect(screen.getByText("draft")).toHaveClass("border-dashed", "uppercase");
  });
});
```

- [ ] **Step 3: 실패 확인** → FAIL
- [ ] **Step 4: 구현**

`card.tsx` — 생성된 `Card` 를 `cva` 로 감싼다(다른 서브컴포넌트는 그대로):

```tsx
import { cva, type VariantProps } from "class-variance-authority"

const cardVariants = cva("flex flex-col gap-6 rounded-xl bg-card text-card-foreground", {
  variants: {
    variant: {
      default: "border py-6 shadow-sm",
      comic: "border-2 border-ink py-6 shadow-hard-lg",
      paper: "border-2 border-ink bg-paper py-6 shadow-hard paper-grain",
    },
  },
  defaultVariants: { variant: "default" },
})

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant ?? "default"}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
}
```

생성된 `Card` 의 기본 클래스 문자열이 위 `default` 와 다르면 **생성된 값을 우선**하고 `default` 에 그대로 옮긴다.

`badge.tsx` — `badgeVariants.variants.variant` 에 추가:

```ts
        ink: "border-2 border-ink bg-background text-foreground shadow-[2px_2px_0_var(--ink)]",
        stamp: "border-2 border-dashed border-ink bg-transparent text-muted-foreground uppercase tracking-[0.12em]",
```

- [ ] **Step 5: 통과 확인**, tsc, `npm run lint`, `npm test`
- [ ] **Step 6: 커밋**

```bash
git add src/components/ui/card.tsx src/components/ui/badge.tsx src/components/ui/card.test.tsx src/components/ui/badge.test.tsx
git commit -m "feat(skin): comic and paper cards, ink and stamp badges"
```

---

### Task 5: `Ribbon` + 대시보드 헤더 적용

**Files:**
- Create: `src/components/ui/ribbon.tsx`, `src/components/ui/ribbon.test.tsx`
- Modify: `src/app/dashboard/page.tsx` (헤더 h1 · 리본 · 사선 컷)

**Interfaces:**
- Produces: `Ribbon({ items: string[]; className?: string })`

- [ ] **Step 1: 실패 테스트** — `ribbon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Ribbon } from "@/components/ui/ribbon";

const ITEMS = ["검증 통과 31", "검토 12", "리스크 3"];

describe("Ribbon", () => {
  test("names the items once for assistive tech", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getByLabelText("검증 통과 31 · 검토 12 · 리스크 3")).toBeInTheDocument();
  });

  test("repeats the run three times so the drift loops seamlessly", () => {
    render(<Ribbon items={ITEMS} />);

    expect(screen.getAllByText("리스크 3")).toHaveLength(3);
  });

  test("is the only tilted element and drifts unless motion is reduced", () => {
    render(<Ribbon items={ITEMS} />);
    const band = screen.getByLabelText(/검증 통과 31/);

    expect(band).toHaveClass("-rotate-1", "bg-primary", "border-ink");
    expect(band.firstElementChild).toHaveClass("ribbon-drift", "font-display", "uppercase");
    expect(band.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: `ribbon.tsx`**

```tsx
import { cn } from "@/lib/utils";

/**
 * 상태 요약을 기울인 띠 하나로 흘린다.
 * 시선을 잡는 장치는 화면에 하나면 충분하다 — 표 위에는 두지 않는다.
 */
export function Ribbon({ items, className }: { items: string[]; className?: string }) {
  const run = [...items, ...items, ...items];
  return (
    <div
      aria-label={items.join(" · ")}
      className={cn(
        "-mx-5 -rotate-1 overflow-hidden border-y-2 border-ink bg-primary py-1.5 text-primary-foreground",
        className,
      )}
    >
      <div aria-hidden="true" className="ribbon-drift flex w-max whitespace-nowrap font-display text-[13px] uppercase tracking-[0.07em]">
        {run.map((item, index) => (
          <span key={index} className="flex items-center gap-4 px-4">
            {item}
            <span className="text-[10px]">★</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx` 헤더**

`import { Ribbon } from "@/components/ui/ribbon";` 추가. 헤더 `</header>` 바로 뒤, 01 Panel 앞에:

```tsx
      <Ribbon
        items={[
          `PASS ${verdicts.counts.verified}`,
          `REVIEW ${verdicts.counts.review}`,
          `RISK ${verdicts.counts.risk}`,
          `PENDING ${verdicts.counts.pending}`,
          `NPS ${monthLabel(summary.months.at(-1))}`,
        ]}
      />
```

라벨은 Anton 이 한글을 못 그리므로 영문 대문자다. h1 은 한글이라 그대로 두되 `tracking-[-0.035em]` 유지. 헤더 `<header>` 에 `className` 끝에 ` pb-4` 를 추가하고 01 Panel 을 감싸는 요소는 두지 않는다 — 사선 컷은 리본이 이미 경계 역할을 하므로 `cut-top` 은 **이번엔 적용하지 않는다**(스펙 5장 5번의 "사선 컷 1곳"은 리본으로 대체. 이유: 사선 컷과 기울인 리본을 같이 두면 장치가 둘이 된다).

- [ ] **Step 5: 확인** — `npx vitest run src/components/ui/ribbon.test.tsx` PASS, tsc, `npm run lint`, `npm test`, `npm run build`
- [ ] **Step 6: 스크린샷** — 컨트롤러가 인증 세션으로 `/dashboard` 를 캡처해 표 숫자 가독성을 확인한다
- [ ] **Step 7: 커밋**

```bash
git add src/components/ui/ribbon.tsx src/components/ui/ribbon.test.tsx src/app/dashboard/page.tsx
git commit -m "feat(skin): status ribbon under the dashboard header"
```

---

## Self-Review

- 스펙 3장(토큰·유틸·Anton) → S1 ✓ · 4-1 Button → S3 ✓ · 4-2 Card / 4-3 Badge → S4 ✓ · 4-4 Ribbon → S5 ✓ · 4-5 Panel → S2 ✓ · 4-6 타이포 → S5 에서 h1 은 한글이라 미적용(스펙 4-6 자체가 한글엔 폴백이라고 명시) · 5장 5단계 순서 = S1~S5 ✓
- 사선 컷(`cut-top`)은 유틸리티만 S1 에서 제공하고 적용은 보류 — 리본과 중복 장치라는 판단, S5 Step 4 에 기록
- 타입: `Ribbon` props 는 S5 안에서만 소비. `Card` `variant` prop 은 `VariantProps` 로 파생되어 `data-variant` 기본값 `"default"` 로 고정
- 플레이스홀더 없음
