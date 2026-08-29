# Microduck 디자인 언어 → shadcn/ui 적용 명세

2026-08-29. 원본: https://pollen-robotics.com/microduck/ (Pollen Robotics × Hugging Face)
분석 방법: 렌더링된 HTML 320KB + Emotion 스타일 146KB + 뷰포트 스크린샷을 직접 읽었다. 수치는 전부 실측값이다.

> **차용 범위.** 시각 언어(서체·색·그림자·질감·리듬)만 가져온다. 오리 캐릭터·스티커·사진·카피·로고는 Pollen 의 자산이라 한 점도 가져오지 않는다.
>
> **이 문서의 형식.** 1~3장은 원본 분석, 4장부터는 이 저장소의 shadcn/ui 구성(`components.json`: new-york · Tailwind v4 · cssVariables · `src/app/globals.css`)에 **그대로 붙일 수 있는 코드**다. 토큰은 `:root` / `.dark` / `@theme inline` 3곳에 같이 등록하고, 컴포넌트는 `cva` variant 로 추가한다 — 기존 `Button` 의 `default`·`outline` 는 건드리지 않는다.

---

## 1. 원본 요약

**"코믹북 + 스케이트 잡지 + CRT"**. 검정(`#101018`)과 크림(`#faf8f2`)을 섹션마다 교대로 깔고, **Anton 압축 고딕 대문자**, **블러 0 하드 오프셋 그림자**, **2~5px 잉크 테두리**, **±3° 기울임**, **사선 컷 섹션 경계**를 얹는다. 강조색은 주황·노랑·핑크·시안 4개뿐이고 그라디언트로 색을 섞지 않는다.

스택: Next.js(Turbopack) + MUI v6 Emotion, 디자인 시스템 없이 `sx` 직접 지정.

### 1-1. 타이포그래피 (실측)

| 역할 | 서체 | 규칙 |
|---|---|---|
| 디스플레이(h1·h2·CTA·가격) | **Anton** (next/font self-host) | `uppercase`, `line-height 0.9~0.95`, `letter-spacing 0.01~0.02em` |
| 본문 | 시스템 산세리프 → DM Sans 폴백 | `400`, `line-height 1.5~1.7` |
| 킥커 | 본문 서체 | `0.72~0.85rem`, `letter-spacing 0.12~0.16em`, `uppercase` |
| 숫자·코드 | `ui-monospace, Menlo` | 스펙 표 |

```
h1  clamp(min(4.8rem, 16.5vw), …)      h3  clamp(1.55rem, 2.4vw, 2rem)
h2  clamp(min(3.2~3.6rem, 12~13.5vw), …) 가격 clamp(2.5rem, 4.4vw, 3.9rem)
리드 clamp(1.05rem, 1.5~1.7vw, 1.3rem)   본문 1rem / 0.95 / 0.88
```

h2 는 항상 `<span>앞</span><span>강조어</span>` 두 조각. 히어로 h1 은 3색 텍스트 섀도:
`0.06em 0.06em 0 #08080c, -0.035em 0 0 #2FF0E6, 0.035em 0 0 #FF2FA8` + `-webkit-text-stroke 0.03em`.

### 1-2. 색 (빈도순)

| 값 | 용도 |
|---|---|
| `#08080c` · `#101018` · `#14141c` · `#1c1c28` | 잉크 / body / 어두운 카드 |
| `#faf8f2` · `#f2ecdd` | 크림 종이 / 크림 카드 |
| `#FF7A2F` 주황 | 주 CTA, 앱바 배경 |
| `#FFD23F` 노랑 | 히어로 제목, 마키 리본 |
| `#FF2FA8` 핑크 · `#2FF0E6` 시안 | 하드 섀도, 색수차 |
| `#9D87E8` · `#8FB8DC` · `#3A6C99` · `#5865F2` | 컬러웨이·커뮤니티 카드 |

### 1-3. 형태·질감 (실측 CSS)

```css
/* 하드 섀도 — 45개 규칙 전부 블러 0 */
box-shadow: 6px 6px 0 #101018;            /* 카드 */
box-shadow: 9px 9px 0 #FF2FA8;            /* CTA, hover 13px, active 0 */
/* 잉크 테두리 */  border: 3px solid #101018;   outline: 3px dashed #101018;
/* 기울임 */       transform: rotate(-2.5deg);  /* 리본 */  rotate(-1.5deg ~ 1.3deg) /* 카드 */
/* 사선 컷 */      clip-path: polygon(0 clamp(18px, 4.5vw, 72px), 100% 0, 100% calc(100% + 2px), 0 calc(100% + 2px));
/* 마키 */         @keyframes drift { to { transform: translate3d(-33.33%, 0, 0) } }   /* 3벌 복제 */
/* 종이 노이즈 */  feTurbulence baseFrequency .8 numOctaves 2, 180px 타일, mix-blend-mode: overlay
/* 도트 그리드 */  radial-gradient(rgba(255,122,47,.2) 3.2px, transparent 3.9px) × 7단계
/* 스캔라인 */     repeating-linear-gradient(to bottom, rgba(0,0,0,.5) 0 1px, transparent 1px 4px)
```

레이아웃: 콘텐츠 1200px(갤러리 1280 · 문단 920), 문단 `40~58ch`, 버튼 `18px 42px` / `15px 34px` / `8px 18px`, 브레이크포인트 MUI 기본(600/900/1200/1536) + 480.

---

## 2. 성과돋보기에 가져올 것 / 버릴 것

원본은 **소비자 제품 런칭 페이지**, 우리는 **평가위원회·운영자용 분석 도구**다. 어휘는 가져오되 **양은 1/5**.

| 채택 | 어디에 | 버림 | 이유 |
|---|---|---|---|
| Anton 디스플레이 서체 | h1, 판정 타일 숫자, 킥커 | 3색 색수차 텍스트 섀도 | 심사 자료에서 글자가 흔들리면 신뢰가 깎인다 |
| 블러 0 하드 섀도 | Card/Panel, 주요 Button | 스티커·둥실·선버스트·스캔라인 | 데이터 화면에 소음 |
| 2px 잉크 테두리 | Card/Panel | 요소별 기울임 | 표·숫자 열은 절대 기울이지 않는다 |
| 크림 종이 바탕 + 노이즈 | body `--surface` | 주황·노랑·핑크 팔레트 | 상태색(verified·review·risk)과 충돌. 강조는 **primary 파랑 하나** |
| 상태 리본(마키) | 대시보드 헤더 아래 1곳 | | 기울임은 `-1deg` 한 곳만 |
| 사선 컷 | 헤더 ↔ 본문 경계 1곳 | | |

---

## 3. 토큰 — `src/app/globals.css`

shadcn 관례대로 **원시값은 `:root`/`.dark`**, **Tailwind 노출은 `@theme inline`**. 기존 토큰은 바꾸지 않고 추가만 한다(단 `--surface` 값 교체).

```css
/* ── @theme inline 블록에 추가 ── */
@theme inline {
  --color-ink: var(--ink);
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --font-display: var(--font-anton), "Pretendard Variable", sans-serif;
  --shadow-hard: var(--shadow-hard);
  --shadow-hard-lg: var(--shadow-hard-lg);
  --shadow-hard-primary: var(--shadow-hard-primary);
}

/* ── :root 에 추가 / 교체 ── */
:root {
  --surface: #faf8f2;                 /* 교체: #f7f7f8 → 크림 */
  --paper: #faf8f2;
  --paper-2: #f2ecdd;
  --ink: #171719;                     /* = --foreground */
  --shadow-hard: 4px 4px 0 var(--ink);
  --shadow-hard-lg: 6px 6px 0 var(--ink);
  --shadow-hard-primary: 6px 6px 0 var(--primary);
}

/* ── .dark 에 추가 ── */
.dark {
  --paper: #141415;
  --paper-2: #1b1c1e;
  --ink: #f7f7f8;
  --shadow-hard: 4px 4px 0 var(--ink);
  --shadow-hard-lg: 6px 6px 0 var(--ink);
  --shadow-hard-primary: 6px 6px 0 var(--primary);
}
```

Tailwind v4 는 `--shadow-*` 를 `shadow-hard` `shadow-hard-lg` `shadow-hard-primary` 유틸리티로, `--font-display` 를 `font-display` 로, `--color-ink` 를 `border-ink` `bg-ink` `text-ink` 로 자동 노출한다.

```css
/* ── @layer utilities 에 추가 ── */
@layer utilities {
  .paper-grain { position: relative; }
  .paper-grain::after {
    content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.06;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .cut-top    { clip-path: polygon(0 clamp(8px, 1.5vw, 20px), 100% 0, 100% calc(100% + 2px), 0 calc(100% + 2px)); }
  .cut-top-rl { clip-path: polygon(0 0, 100% clamp(8px, 1.5vw, 20px), 100% calc(100% + 2px), 0 calc(100% + 2px)); }
  @keyframes ribbon-drift { to { transform: translate3d(-33.333%, 0, 0); } }
  .ribbon-drift { animation: ribbon-drift 40s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .ribbon-drift { animation: none; } }
}
```

### 3-1. 서체 — `src/app/layout.tsx`

Pretendard 는 CDN 그대로 두고 Anton 만 `next/font/google` 로 self-host 한다.

```tsx
import { Anton } from "next/font/google";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });

<html lang="ko" className={anton.variable}>
```

---

## 4. 컴포넌트 — `cva` variant 추가

### 4-1. `Button` — `src/components/ui/button.tsx`

기존 variant 는 그대로 두고 두 개를 **추가**한다.

```ts
variant: {
  /* …기존 default / destructive / outline / secondary / ghost / link… */
  hard:
    "border-2 border-ink bg-primary text-primary-foreground shadow-hard " +
    "hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg " +
    "active:translate-x-1 active:translate-y-1 active:shadow-none " +
    "focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  "hard-outline":
    "border-2 border-ink bg-background text-foreground shadow-hard " +
    "hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg " +
    "active:translate-x-1 active:translate-y-1 active:shadow-none",
},
size: {
  /* …기존… */
  display: "h-11 rounded-md px-6 font-display text-[15px] uppercase tracking-[0.02em]",
},
```

```tsx
<Button variant="hard" size="display">분석 실행</Button>
<Button variant="hard-outline" size="sm">목록으로</Button>
```

### 4-2. `Card` — `npx shadcn@latest add card` 후 `src/components/ui/card.tsx`

shadcn `Card` 는 variant 가 없으므로 `cva` 를 감싼다.

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const cardVariants = cva(
  "flex flex-col gap-6 rounded-xl bg-card text-card-foreground",
  {
    variants: {
      variant: {
        default: "border py-6 shadow-sm",
        comic:   "border-2 border-ink py-6 shadow-hard-lg",
        paper:   "border-2 border-ink bg-paper py-6 shadow-hard paper-grain",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Card({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" data-variant={variant} className={cn(cardVariants({ variant, className }))} {...props} />;
}
```

### 4-3. `Badge` — `npx shadcn@latest add badge` 후 variant 추가

```ts
variant: {
  /* …기존… */
  ink:   "border-2 border-ink bg-background text-foreground shadow-[2px_2px_0_var(--ink)]",
  stamp: "border-2 border-dashed border-ink bg-transparent text-muted-foreground uppercase tracking-[0.12em]",
},
```

### 4-4. `Ribbon` — 신규 `src/components/ui/ribbon.tsx`

마키. 항목을 3벌 복제해 1/3 이동으로 무한 루프. 대시보드 헤더 아래 **1곳**만 쓴다.

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
      <div aria-hidden className="ribbon-drift flex w-max whitespace-nowrap font-display text-[13px] uppercase tracking-[0.07em]">
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

```tsx
<Ribbon items={[`검증 통과 ${verified}`, `검토 ${review}`, `리스크 ${risk}`, `최근 스냅샷 ${month}`]} />
```

### 4-5. `Panel` — `src/components/dashboard/panel.tsx` (기존 프리미티브)

카드 한 줄만 바꾸면 대시보드 6개 섹션이 같이 바뀐다.

```diff
- <div className="… rounded-[10px] border border-border bg-background shadow-[0_1px_2px_rgba(23,23,25,0.04)]">
+ <div className="… rounded-[10px] border-2 border-ink bg-background shadow-hard">
```

푸터 띠는 `bg-surface` → 크림이 되므로 그대로 두되, 표 안쪽 `border-hairline` 은 유지한다.

### 4-6. 타이포 유틸 — `SectionHead` / 페이지 h1

```tsx
/* 페이지 h1 */
<h1 className="font-display text-[clamp(2rem,4vw,3rem)] uppercase leading-[0.95] tracking-[0.01em]">
  선정 근거 준비 현황
</h1>

/* 킥커 */
<span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">…</span>

/* VerdictBoard 큰 숫자 — font-mono 를 font-display 로 */
<span className="font-display text-[34px] leading-none tabular-nums">{count}</span>
```

Anton 은 한글 글리프가 없어 **숫자·영문에만** 적용된다. 한글 제목은 `font-display` 를 붙여도 폴백(Pretendard)으로 떨어지므로, 한글 h1 에는 `font-extrabold tracking-[-0.035em]` 을 쓰고 `uppercase` 만 공유한다.

---

## 5. 적용 순서

진행 중인 `docs/superpowers/plans/2026-08-29-dashboard-redesign.md` 는 **구조**, 이 문서는 **피부**다. 그 플랜의 Task 14 이후 별도 태스크로:

| # | 작업 | 파일 | 검증 |
|---|---|---|---|
| 1 | 토큰·유틸리티·Anton 폰트 | `globals.css`, `layout.tsx` | `design-primitives.test.tsx` 에 `--shadow-hard`·`--ink`·`--paper` 존재 검사 추가 |
| 2 | `Panel` 카드 셸 교체 | `panel.tsx` | 기존 Panel 테스트 통과 + 대시보드 스크린샷 |
| 3 | `Button` `hard`/`hard-outline`/`display` | `ui/button.tsx` | `button.test.tsx` 에 variant 렌더 1건 |
| 4 | `Card` `comic`/`paper`, `Badge` `ink`/`stamp` | `ui/card.tsx`, `ui/badge.tsx` | shadcn add 후 variant 테스트 |
| 5 | `Ribbon` + 대시보드 헤더 아래 배치, `cut-top` 1곳 | `ui/ribbon.tsx`, `dashboard/page.tsx` | `prefers-reduced-motion` 에서 정지 확인 |

각 단계마다 `/dashboard` 스크린샷을 찍어 **표의 숫자 가독성이 떨어지지 않았는지** 본다. 이 스타일의 실패 모드는 "귀엽지만 숫자가 안 읽힌다"이다.

---

## 부록 — 실측 원자료

- 스크린샷 1920×1080 뷰포트(히어로·마키·스쿼드 상단)
- 서체: `/_next/static/media/*.woff2` 2종 preload(Anton, DM Sans), `Anton Fallback` 메트릭 폴백
- `box-shadow` 45 / `rotate` 368 / `clip-path` 18 / `@keyframes` 7(`crt-scan-roll`·`microduck-marquee-drift`·`sticker-bob-12`·`duckSunburst` 외)
- 색 빈도: `#08080c` 106 · `#101018` 77 · `#ffffff` 52 · `#ff7a2f` 39 · `#ffd23f` 29 · `#ff2fa8` 27 · `#2ff0e6` 19 · `#faf8f2` 16 · `#f2ecdd` 14
- 섹션 13개: 글로벌바 → 앱바(스크롤 시 주황) → 히어로(비디오+스캔라인+3색 h1+마키) → 스쿼드(크림) → 필름 → sim2real → 트릭(01~04 단계+카드 6) → 컬러웨이(선버스트) → 갤러리(마소너리) → 팩(코믹 패널+가격) → 스펙(맥 터미널 창) → 오픈소스 → 커뮤니티(Discord) → 프리오더(주황 풀블리드) → 푸터
