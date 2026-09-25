# 다음 세션 인계 — 2026-09-25

> 이 문서 → `CLAUDE.md` → 실행 플랜 `2026-09-25-jev-pipeline.md` 순으로 읽는다. superpowers TDD, 태스크 단위 커밋.
> **작업 트리에 사용자의 미커밋 작업(환경변수 관리자 로그인: `env.ts`·`envAccount.ts`·`authenticate.ts`·`.env.example`·`deploy/README.md` 등)이 있다.**
> 같은 파일을 고치면 HEAD 에 내 변경분만 얹어 스테이징한다(`git show HEAD:<file>` 에 같은 치환을 적용 → `git hash-object -w` → `git update-index --cacheinfo`). 사용자 변경을 커밋에 섞지 않는다.

## 0. 이 세션에서 끝난 것 (커밋 9건, 전체 1737 테스트 통과)

| 커밋 | 내용 |
|---|---|
| `f505549` | 3자 이하 기업명이 더 긴 단어의 꼬리면 언급으로 세지 않는다 — 누아 주제 후보 13건 중 11건(아누아·피노누아·와이누아)·페어리 2건(르페어리)이 타사 기사였다 |
| `00c9ffb` | `data/jev-gate/` gitignore |
| `b5130d9` | 실행 플랜 `2026-09-25-jev-pipeline.md` |
| `cdd517d` | T1 `batch.company_timing`(collectMs·pipelineMs·totalMs) · `analysis.timing`(analyzeMs·verifyMs) 로그 |
| `0827084` | T2 기동 때 `enableWal` — busy timeout 은 better-sqlite3 기본 5초가 이미 있다. 복원 절차에 `-wal`·`-shm` 삭제 |
| `58d6bdc` | T3 기업 동시 처리(runBatch 기본 1, 배치 라우트 기본 2·최대 4) · 기업 이벤트 즉시 전송 · 중단 기업을 완료에서 제외 · 실행 중 「진행 n/N」 |
| `69d807e` | T4 본문 블록 경계 줄바꿈(“조달바이오바이츠가” 해소) · 푸터만 긁힌 본문 제거(`isBoilerplateBody`) |
| `6ed50ae` | T5 `typesafe.ts` Jev 클라이언트(재시도·zod) · `ANALYZER`(llm\|jev) 기동 게이트 · `api_smoke_test.py` `test_typesafe`(실측 PASS) |
| `4ce93fd` | T6 `jevAnalyzer.ts`·`jevCandidates.ts` — ANALYZER=jev 경로. 판정은 Jev, 요약·성장·금액·수상명은 원문 후보 선택, 보류(held) 0.3~0.7, 감성 7단계 앵커 보간, `formulaVersion` v3-jev / v2-<공급자> |

**기본 분석기는 여전히 `llm`.** Jev 게이트(사람 정답 기준 주제 ≥95%)를 통과하기 전에는 켜지 않는다.

## 1. 첫 30분

- [ ] 사람 정답셋 판정 확인 — 검토 페이지 https://claude.ai/artifact/SskpB4c5ZftmH3rPFK2byv 의 db `labels/<g001..g083>`(entity·role·form·about·note). `ArtifactData list` 로 읽는다. 필수 53건이 차 있어야 T7 채점이 의미 있다
- [ ] 누아·페어리 재분석 — 저장된 분석이 타사 기사로 오염돼 있다: `npx tsx scripts/analyze-all.ts 2026 20 누아,페어리 --force`

## 2. 남은 태스크 (플랜 T7~T9)

- [ ] **T7 게이트 채점 스크립트** `scripts/eval-jev-gate.ts` — `data/jev-gate/gold.json`(Sonnet 기준 272건) 기사로 **새** Jev 분석기(분해 질문·회사 프로필)를 돌려 채점. 사람 정답(`data/jev-gate/human-labels.json`, 검토 페이지에서 내려받아 둔다)이 있으면 그것을 기준으로. 1차 게이트(90.1%)는 옛 단일 질문 설계였으므로 재채점이 필수. 보류 하한 0.3·성장 0.6·감성 앵커도 여기서 보정한다
- [ ] **T8 스케줄러** — systemd timer(`Persistent=true`) + `scripts/scheduled.ts news|pension|procurement|venture` + JobLock 테이블(웹 배치도 같은 잠금). 야간 뉴스 단계는 `SCHEDULE_NEWS_STAGE`(기본 `news` — 기본 분석기가 llm 인 동안 LLM 비용을 매일 쓰지 않는다). 연금은 매월 16일(거르면 그 달 영구 손실)
- [ ] **T9 문서** — CLAUDE.md 의 "스케줄러 없음"(로드맵·usability spec 의 사용자 결정) 번복 반영, ANALYZER·Jev 한 단락, `deploy/README.md` 정기 작업표를 timer 로

## 3. 자료 위치

- `data/jev-gate/` (gitignore): `gold.json` · `results.jsonl`(1차 Jev 원답) · `run.mjs`·`score.mjs`(`node --env-file=.env data/jev-gate/run.mjs`) · `review-key.json`(검토 83건의 층·Sonnet/Jev 답 — 채점 조인 키) · `review-items.json` · `review.template.html`·`build-review.mjs`
- 검토 표본 층: A 불일치 27 · B 합의+Jev 불확실(0.2~0.8) 26 = 필수 53 · C 확신 합의 30(예 20/182·아니오 10/37) = 선택. C 는 층 가중치로 확장해 전체 정확도를 추정한다
- Jev 키는 `.env` 한 곳(`TYPESAFE_API_KEY`·`TYPESAFE_MODEL`). `.env.local` 을 만들지 않는다 — 빈 값이 `.env` 를 가린 적이 있다
- 1차 게이트 수치: 주제 일치 90.1%(CI 85.9~93.1) · AUC 0.964 · 요청 p50 228ms · 272건 $0.025. 불일치 27건 중 Sonnet 오답 추정 약 15건(누아/아누아 등), Jev 오답 약 7건(‘두 곳 선정’·3자 협약 같은 다수 당사자 기사)

## 4. 완료분의 확인할 위험

- **T3 동시 처리**: LLM 동시 호출이 기업 2곳 × 기사 4 × 2 로 늘어난다. 다음 배치에서 429 빈도와 `batch.company_timing` 으로 실제 단축 폭을 잰다(배치 기준선 2026-09-04 약 47분)
- **T4 본문 줄바꿈**: 새로 수집한 본문에는 블록 경계 `\n` 이 남는다. 옛 본문과 형식이 다르다 — 테스트상 소비자 영향은 없었다
- **T6 문턱값**은 원리로 정한 값이다 — T7 에서 데이터로 보정 전까지 기본 경로로 켜지 않는다

## 5. 그 다음

- 판정 보류(held) 기사 검토 큐 UI · 기사 단위 판정 캐시(야간 증분의 재추론 생략) · judge 를 Jev 인용검사로 옮기는 게이트(저장된 layer2 claims 가 기준셋)
- `docs/2026-09-03-production-readiness.md` §3-2 잔여: SSE 하트비트, 실패한 기업만 재실행, 확인 필요 큐의 `no_business_no`·`no_news` 종결 등
