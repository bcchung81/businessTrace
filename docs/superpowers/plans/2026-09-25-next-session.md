# 다음 세션 인계 — 2026-09-25 (저녁 갱신)

> 이 문서 → `CLAUDE.md` → 실행 플랜 `2026-09-25-jev-pipeline.md` 순으로 읽는다. superpowers TDD, 태스크 단위 커밋.
> **작업 트리에 사용자의 미커밋 작업(환경변수 관리자 로그인: `env.ts`·`envAccount.ts`·`authenticate.ts`·`.env.example`·`deploy/README.md`·`instrumentation-node.ts` 등)이 있다.**
> 같은 파일을 고치면 HEAD 에 내 변경분만 얹어 스테이징한다(`git show HEAD:<file>` 에 같은 치환을 적용 → `git hash-object -w` → `git update-index --cacheinfo`). 사용자 변경을 커밋에 섞지 않는다.

## 0. 끝난 것 — 플랜 T1~T9 전부 (전체 1778 테스트 통과)

| 커밋 | 내용 |
|---|---|
| `f505549`·`cdd517d`·`0827084`·`58d6bdc`·`69d807e`·`6ed50ae`·`4ce93fd` | 오전 세션 — 3자 이하 꼬리 규칙, T1 계측, T2 WAL, T3 동시 처리, T4 본문, T5 Jev 클라이언트, T6 Jev 분석기 |
| `51fa6cc` | T7 `scripts/eval-jev-gate.ts` + `jevGate.ts`(Wilson·AUC·κ·Spearman·층화 추정·게이트). 원답 캐시 `data/jev-gate/results-v3.jsonl` |
| `55f520c` | **LLM 분석기에도 회사 프로필을 넣는다** — 아래 1 참고 |
| `9a64522` | T8 `JobLock` + `holdJobLock`(10분 임대·2분 갱신) · `scripts/scheduled.ts` · systemd `seonggwa-job@.service` + timer 4개 · 웹 배치도 `batch` 잠금 · 기동 때 `web:` 잠금 해제 |
| `958e4de` | T9 CLAUDE.md·`deploy/README.md` 정기 작업표·`.env.example` `SCHEDULE_NEWS_STAGE`·"스케줄러 없음" 번복 표기 |

## 1. 이번에 드러난 것

- **누아·페어리 재분석은 옛 인계의 명령이 틀렸다** — `analyze-all.ts 2026 …` 은 0개사다. 누아는 2025, 페어리는 2024 에 등록돼 있다
- 프로필 없이 재분석(run 298·299)하자 '주제' 6건이 **전부 타사**였고 그런데도 verified 였다 — 누아건축사사무소 2·누아엔터테인먼트(그룹 누에라) 3·페어리스타 1. 꼬리 규칙은 머리 합성어를 못 막고, 파이프라인이 읽은 프로필을 LLM 분기가 버리고 있었다
- 프로필을 넣고 다시 돌리자(run 300·301) 6건 모두 about 0.05~0.1 → **둘 다 no_news**. 이 두 회사는 최근 90일에 자기 기사가 없다
- Jev 새 설계(분해 질문·프로필) Sonnet 기준 참고치: 주제 88.2% [83.9, 91.5] · AUC 0.921 · 보류 16 · 감성 ρ 0.86 · p50 255ms · 입력 125만 토큰. 옛 단일 질문(90.1%)보다 낮지만 불일치 32건 다수가 설계상 '명시된 당사자'(길의료재단 협약 기사 등)다 — **Sonnet 기준으로는 판정할 수 없다**
- 검토 페이지 db `labels` 는 **0건**이었다(2026-09-25 23시). 판정을 했다면 브라우저 localStorage(`gold-labels`)에만 남았을 수 있다

## 2. 남은 것

- [ ] **사람 정답셋 판정** — 검토 페이지 https://claude.ai/artifact/SskpB4c5ZftmH3rPFK2byv 에서 필수 53건(A·B). 다 차면 `ArtifactData list labels` 로 읽어 `data/jev-gate/human-labels.json`(`{"g001": {"about": "yes", …}}`)에 두고 `npx tsx scripts/eval-jev-gate.ts --score-only` → 게이트 통과면 `ANALYZER=jev` 기본화
- [ ] **다음 전체 배치에서 프로필 회귀 확인** — 프로필이 실제 자기 기사까지 N 으로 떨어뜨리는지. 직전 배치 대비 no_news·보류가 늘어난 기업의 기사를 본다
- [ ] **서버에서** `systemd-analyze calendar` 로 timer 4개 일정 확인(macOS 라 로컬에서 못 봤다), 첫 배포 뒤 `systemctl enable --now seonggwa-*.timer`
- [ ] 결정 필요: 야간 `news` 단계는 collected 실행을 매일 56건(건당 약 25KB) 쌓지만 **아무 화면·분석도 읽지 않는다**(분석은 매번 새로 수집). Jev 기본화 전까지 `SCHEDULE_NEWS_STAGE=off` 로 둘지, 수집분을 분석이 이어받게 할지

## 3. 자료 위치

- `data/jev-gate/` (gitignore): `gold.json`(Sonnet 기준 272건) · `results.jsonl`(1차 옛 설계 원답) · `results-v3.jsonl`(새 설계 원답, 요청 해시로 무효화) · `review-key.json`(검토 83건의 층 — A 27·B 26·C 30, 모집단 A27·B26·Cyes182·Cno37) · `review-items.json` · `review.template.html`·`build-review.mjs`
- Jev 키는 `.env` 한 곳(`TYPESAFE_API_KEY`·`TYPESAFE_MODEL`). `.env.local` 을 만들지 않는다 — 빈 값이 `.env` 를 가린 적이 있다

## 4. 그 다음

- 판정 보류(held) 기사 검토 큐 UI · 기사 단위 판정 캐시(야간 증분의 재추론 생략) · judge 를 Jev 인용검사로 옮기는 게이트(저장된 layer2 claims 가 기준셋)
- `docs/2026-09-03-production-readiness.md` §3-2 잔여: SSE 하트비트, 실패한 기업만 재실행, 확인 필요 큐의 `no_business_no`·`no_news` 종결 등
- T3 동시 처리의 실제 단축 폭·429 빈도는 다음 배치의 `batch.company_timing` 으로 잰다(기준선 2026-09-04 약 47분)
