# 시각 리디자인 — 방향 B「신호(Signal)」

2026-08-30. `docs/design/2026-08-30-redesign-meta-prompt.md` 실행 ① 에서 세 방향(장부·신호·서류철) 중 **B 신호**를 채택했다. 캔버스: https://claude.ai/code/artifact/d0181e8e-2e10-4e1c-ae08-9acbf584d236 (Direction B · Wordmark B). 인벤토리(§4)·원칙(§2)·라벨(§3)은 그대로이고 바뀌는 것은 시각 언어뿐이다.

## 방향

운영자가 3분 안에 훑는 화면이므로 **요약문이 헤드라인이다.** 짙은 밴드(`--band`)에 H1 과 요약문을 크게 두고, 그 밑을 primary 띠가 신선도 항목으로 잇는다. 절은 4px 굵은 괘선과 큰 번호로 나뉜다. 카드 상자·하드 그림자·크림지·코믹북 리본은 모두 걷어낸다. 서체는 Pretendard 본문 + **Gothic A1 900** 디스플레이(H1·절 번호·절 제목·리본 수치).

트레이드오프(기록): 밴드가 무거워 월간 문서 표지는 별도 헤더가 필요하고, 다크에서 밴드와 배경의 구분이 흐려진다 — 다크는 밴드를 배경보다 한 단계 더 어둡게 둔다.

## 토큰 (`src/app/globals.css`)

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#0F1523` | 본문 |
| `--surface` | `#F5F6F8` | `#151C2C` | 표 머리·로그인 배경 |
| `--band` | `#0B1220` | `#060A14` | 헤더 밴드 |
| `--band-foreground` | `#FFFFFF` | `#F2F4F8` | 밴드 위 글자 |
| `--foreground` / `--ink` | `#0B1220` | `#F2F4F8` | 글자 · 굵은 괘선 |
| `--muted-foreground` | `#5B6170` | `#9AA3B5` | 보조 글자 |
| `--border` | `#0B1220` | `#F2F4F8` | 절 괘선·칩 테두리(굵은 선) |
| `--hairline` | `#E3E5EA` | `#26304A` | 행 구분선 |
| `--primary` | `#2B6BFF` | `#5B8CFF` | 유일한 강조색 · 리본 · CTA |
| 상태색 | verified `#158A3E`/`#EAF7EE`/`#158A3E` · review `#B85A00`/`#FFF3E3`/`#F09A17` · risk `#D42B2B`/`#FDECEC`/`#D42B2B` · pending `#5B6170`/`#F1F2F5`/`#C3C7D1` | 기존 다크값 유지 | 의미에만 |

제거: `--paper` `--paper-2` `--shadow-hard*` `--font-hangul-display` `.paper-grain` `.cut-top` `.ribbon-drift`. 유지: `.hatch`(결측 빗금).

## 컴포넌트 문법

- **셸** 56px 밴드. 워드마크 B(렌즈가 '보'를 관통하며 반전) + 태그라인. 활성 내비는 밴드 위 흰 상자.
- **홈 헤더** 밴드 안에 아이브로우(primary) · H1 52px/900 · 요약문 20px · 우측 연금 스냅샷·마지막 분석·월간 문서·CTA.
- **리본** primary 띠 36px, 정지. 항목은 세로선으로 나뉜다. 화면의 유일한 시선 장치.
- **Panel** 카드 상자 없음. 4px 상단 괘선 + 절 번호(24px/900) + 제목(18px/900) + 태그(1.5px 테두리 · 자간 0.12em). 푸터는 점선 상단.
- **Badge `signal`** 채운 잉크 사각(신뢰 배지·칩 건수). **Button `signal`/`signal-outline`** 사각 1.5px 테두리, 그림자 없음. **Card `signal`** 1.5px 잉크 테두리.
- 표: 머리 2px 잉크 하단선, 행 hairline. 칩: 1.5px 잉크 테두리 + 건수는 잉크 채움.

## 이관 순서

토큰 → `Panel`·`SectionHead`·`Ribbon`·`Badge`·`Button`·`Card` → `AppShell`·로그인 → 홈 → 기업·상세. 명칭은 바뀌지 않는다.
