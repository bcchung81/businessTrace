# Jev 판정 경로·배치 지연·스케줄러 실행 플랜 (2026-09-25)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 50개사 배치 완주 시간을 줄이고, 기사 판정을 TypeSafe **Jev**(System One 모델)로 옮길 경로를 완성하며, 사람이 누르지 않아도 정기 작업이 돌게 한다.

**Architecture:** Next.js 풀스택 그대로. Jev 는 `analyze` 의존성의 **대체 구현**으로 들어간다 — 같은 `AnalysisResult`(기사별 trend·award·investment)를 내므로 검증·사건·랭킹·엑셀·화면은 바뀌지 않는다. 판정(주제·역할·형식·감성·부정유형·수상·투자·라운드)은 Jev 질문으로, 문장 항목(요약·성장 문장·수상명·금액)은 **코드가 원문에서 후보를 뽑고 Jev 가 고르게** 해서 원문 스팬만 남긴다. 종합의견과 검증 judge 는 LLM 그대로.

**Tech Stack:** Next.js 16.3.3 · Prisma 7 + SQLite(better-sqlite3) · zod 4 · Vitest 4 · Jev HTTP API(`POST https://api.typesafe.ai/v1/systemone`)

**근거:** 2026-09-25 세션 — 배치 실측(54개사 약 47분: LLM 분석 1,403초 + 수집·검증 1,328초), Jev 1차 게이트(주제 일치 90.1% — Sonnet 기준 오염 확인, 사람 정답셋 판정 대기), 사용자 결정(모든 판정 Jev · 감성도 Jev score · judge 는 마지막에 게이트 후 · 게이트 미달이면 기본 교체 안 함 · 야간 증분).

## Global Constraints

- **기본 분석기는 `llm` 으로 둔다.** 사람 정답셋 기준 주제 판정 ≥95% 게이트를 통과하기 전에는 `ANALYZER=jev` 를 기본으로 켜지 않는다
- 모르는 `ANALYZER` 값은 던진다(`LLM_PROVIDER` 와 같은 규칙). `ANALYZER=jev` 인데 `TYPESAFE_API_KEY` 가 없으면 기동 게이트가 막는다
- 주석은 함수 JSDoc 만, 본문 3줄 이내. 외부 API 테스트는 전부 mock
- 사용자 미커밋 변경(`.env.example`·`src/lib/env.ts`·`deploy/README.md` 등)을 커밋에 섞지 않는다 — 겹치는 파일은 HEAD 에 이 플랜의 변경분만 얹어 스테이징한다
- Jev 질문 지시문은 영어, 기준 용어는 한국어 병기. state 는 이름 붙은 JSON 필드. 원확률(noul·probabilities)을 결과에 남겨 정책(문턱)을 바꿔도 재추론이 필요 없게 한다

---

## 파일 구조

```
src/lib/services/batchRun.ts            T1·T3  단계별 소요 로그 · 기업 동시 처리 · 레이트리밋 집계 수정
src/lib/services/analysisPipeline.ts    T1·T6  분석·검증 소요 · 분석기별 formulaVersion
src/lib/db.ts                           T2     enableWal
src/instrumentation-node.ts · scripts/* T2     기동 때 WAL
src/lib/services/articleBody.ts         T4     블록 구분자 · 푸터 본문 판정
src/lib/services/typesafe.ts            T5     Jev HTTP 클라이언트(zod·재시도·타임아웃)
src/lib/env.ts                          T5     ANALYZER·TYPESAFE_API_KEY 게이트
scripts/api_smoke_test.py               T5     Jev 검사 함수
src/lib/services/jevCandidates.ts       T6     문장 분리·언급 창·금액/수상명/요약 후보
src/lib/services/jevAnalyzer.ts         T6     질문 묶음·정책·NewsAnalysis 로 변환
src/lib/services/analyzerChoice.ts      T6     ANALYZER 해석
scripts/eval-jev-gate.ts                T7     gold 대비 게이트 채점(사람 정답 있으면 우선)
prisma/schema.prisma · migrations       T8     JobLock
src/lib/repositories/jobLock.ts         T8     잠금 획득·해제
scripts/scheduled.ts                    T8     정기 작업 진입점(news·pension·procurement·venture)
deploy/seonggwa-*.service·timer         T8     systemd timer
CLAUDE.md · docs                        T9     결정 갱신(스케줄러·Jev)
```

---

### T1. 단계별 소요 계측
- [ ] 실패 테스트: `runBatch` 가 기업마다 `batch.company_timing` 로그(collectMs·pipelineMs·totalMs)를 남긴다 / `runCompanyAnalysis` 가 `analysis.timing`(analyzeMs·verifyMs)을 남긴다
- [ ] 구현: `performance.now()` 로 구간을 재고 `logEvent("info", …)`
- [ ] 커밋: `feat(batch): 기업마다 수집·분석·검증 소요를 구조화 로그로 남긴다`

### T2. SQLite WAL
- [ ] 실패 테스트: `enableWal(client)` 가 `PRAGMA journal_mode = WAL` 을 실행하고 결과 모드를 돌려준다
- [ ] 구현: `db.ts` 에 `enableWal`, 서버 기동(instrumentation)과 CLI 스크립트에서 호출. busy timeout 은 better-sqlite3 기본 5초가 이미 있다
- [ ] 커밋: `feat(db): 기동 때 SQLite 를 WAL 로 전환해 스케줄러와 웹이 서로를 막지 않게 한다`

### T3. 기업 동시 처리
- [ ] 실패 테스트: `concurrency: 2` 면 두 기업이 겹쳐 돈다 / 레이트리밋이 나면 새 기업을 시작하지 않고 남은 기업은 `aborted` / `batch_done.done` 은 실제로 끝낸 기업만 센다
- [ ] 구현: 워커 풀, 레지스트리 `current` 는 진행 중 기업 이름을 `·` 로 잇는다, 이벤트는 기업 단위로 흘린다(리듀서는 companyId 로 합친다)
- [ ] 커밋: `feat(batch): 기업을 동시에 처리해 수집 대기와 LLM 대기를 겹친다`

### T4. 본문 추출 품질
- [ ] 실패 테스트: 블록 요소 사이에 줄바꿈이 들어간다(“조달\n바이오바이츠가”) / 사이트 푸터(등록번호·발행인·사업자등록번호 반복)만 있는 본문은 버리고 설명문으로 대신한다
- [ ] 커밋: `fix(collector): 본문 블록을 붙이지 않고, 푸터만 긁힌 본문은 설명문으로 대신한다`

### T5. Jev 클라이언트와 게이트
- [ ] 실패 테스트(mock fetch): 요청 모양·Bearer·타임아웃 / 429·529 재시도 / 422 는 던짐 / zod 로 answers 검증
- [ ] `checkEnv`: `ANALYZER` 는 llm|jev, jev 면 `TYPESAFE_API_KEY` 필수
- [ ] `api_smoke_test.py` 에 `check_typesafe`
- [ ] 커밋: `feat(jev): TypeSafe Jev HTTP 클라이언트와 기동 게이트를 더한다`

### T6. Jev 분석기
- [ ] 실패 테스트: 후보 추출(문장 분리·언급 창·‘N억원’ 금액·수상명·요약 후보) / 질문 묶음 / 정책(about = P(same)×(P(main)+P(party)) ≥ 0.7, 0.3~0.7 은 보류) / 감성 7단계 앵커 보간 / 결과가 `NewsAnalysis` 모양
- [ ] `ANALYZER` 로 `defaultPipelineDeps` 의 analyze 를 고른다. `createRun` 이 분석기별 `formulaVersion`(`v2-llm`·`v3-jev`)을 기록한다
- [ ] 커밋: `feat(jev): 기사 판정을 Jev 로 하는 대체 분석기 — 문장 항목은 원문에서 고른다`

### T7. 저장소 평가 스크립트
- [ ] `scripts/eval-jev-gate.ts` — `data/jev-gate/gold.json` 기사로 Jev 분석기를 돌려 주제·수상·투자·부정유형·감성(순위상관·사건 일치)을 채점. `data/jev-gate/human-labels.json` 이 있으면 사람 정답을 기준으로 삼는다
- [ ] 커밋: `feat(jev): 게이트 채점 스크립트를 저장소에 둔다`

### T8. 스케줄러
- [ ] 실패 테스트: `acquireJobLock` 이 만료 전 두 번째 보유자를 막고 만료 뒤엔 넘겨준다 / 웹 배치도 같은 잠금을 잡는다
- [ ] `scripts/scheduled.ts news|pension|procurement|venture` + systemd timer(`Persistent=true`)
- [ ] 야간 뉴스 작업의 단계는 `SCHEDULE_NEWS_STAGE`(기본 `news` — 기본 분석기가 llm 인 동안 LLM 비용을 매일 쓰지 않는다)
- [ ] 커밋: `feat(schedule): systemd timer 로 야간 뉴스·월간 연금·조달·분기 벤처 작업을 돌린다`

### T9. 문서
- [ ] CLAUDE.md 의 "스케줄러 없음" 결정 갱신, Jev·ANALYZER 한 단락, 운영 작업표
- [ ] 커밋: `docs: 스케줄러 도입과 Jev 판정 경로를 문서에 반영한다`

## 이 플랜 밖 (다음)
- 사람 정답셋 판정 결과로 T7 게이트 재채점 → 통과 시 `ANALYZER=jev` 기본화
- 판정 보류 기사 검토 큐 UI, 기사 단위 판정 캐시(야간 증분의 재추론 생략)
- judge 를 Jev 인용검사로 옮기는 게이트(저장된 layer2 claims 가 기준셋)
