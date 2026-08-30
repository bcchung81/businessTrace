# 다음 세션 인계 — 2026-09-01

> 새 세션은 이 문서 → `CLAUDE.md` → 마스터 로드맵(`2026-08-26-nextjs-rearchitecture.md`) 순으로 읽는다. 작업은 superpowers TDD(실패 테스트 → 구현 → 통과 → 태스크 단위 커밋)로 한다. 커밋 훅이 매번 `npm test` 전체(약 40초)를 돌리므로 **커밋은 한 명령에 하나씩**, 새 파일을 만드는 명령과 커밋 명령을 분리한다(훅이 명령 시작 시점에 실행돼 미완성 테스트가 커밋을 막는다).

## 0. 현재 상태 (2026-08-31 종료 시점)

- 브랜치 `feat/nextjs-rearchitecture`, 작업 트리 깨끗. 마지막 커밋 `ff36183`. 테스트 958개 통과 · lint 오류 0(경고 11) · `next build` 통과.
- **개발 서버(3000)를 반드시 재시작**한다 — 8-30 스키마 변경(`SourceDecision`, `Company.aliases`, `VerificationResult.reviewed*`) 뒤 재시작하지 않아 기업 상세·홈이 500 을 낸다. `./scripts/dev.sh`.
- 이번 주에 끝난 것: 디자인 B「신호」이관 전 화면 · 좌측 책갈피 탭 · Task 12 랭킹 · Task 13 기여도/인용 · 일괄 분석 실행 화면 + 헤더 배지 · 기업 상세 "확인 필요" 블록 · 홈 파이프라인 밴드(A2) + 기준일/할 일 리본 · 기업 목록 표·무보도 표기 · 기업 정보 확장(기본 줄·종업원 3원천·인건비·입퇴사·원천 상세·재무 전년비·상장). 각 실행 플랜은 `docs/superpowers/plans/2026-08-30-*.md`, `2026-08-31-company-facts.md`.
- 디자인 캔버스: https://claude.ai/code/artifact/d0181e8e-2e10-4e1c-ae08-9acbf584d236 (페이지 "방향"·"현행 화면"). 작업 파일은 세션 스크래치에 있었으므로 새 세션에서는 캔버스를 `read`→`--extract` 해서 이어간다.
- `/code-review`(codex·agy) 결과가 오지 않은 채 세션이 끝났다 — 새 세션에서 다시 돌리거나 `git diff main...HEAD` 로 리뷰한다.

## 1. 첫 30분 — 실물 점검·데이터 재적재

- [ ] `./scripts/dev.sh` 재시작 → `/dashboard` `/companies` `/companies/29`(SDT) `/companies/3`(넷록스) `/ranking` 이 200 인지, 홈 밴드 4노드 수치와 리본 문구가 말이 되는지 본다.
- [ ] `/companies` 일괄 실행 패널: 단계 **원천 대조만** · 전체 → 실행. 끝나면 기업 상세 기본 줄·재무 전년비·상장 여부가 채워진다(파서가 8-31 에 바뀌어 기존 스냅샷에는 없음).
- [ ] 같은 패널: 단계 **전체** · 재실행 허용 · 시작일 기본(90일) · 전체 → 실행. 34개사 "무보도"가 30일 창의 사건으로 바뀐다. LLM 비용이 드니 먼저 3~5개사로 시험.
- [ ] SDT(29) 확인 필요 블록에서 국민연금 후보 확정, 써로마인드(14)·이퀄라이저(52)·페어리(4) DART 후보 판정, 이퀄라이저·그리너리 검색 별칭 입력 → 각 저장이 재조회로 이어지는지 확인.

## 2. 코드 리뷰 반영 (반나절)

- [ ] `/code-review` 재실행(또는 `git log main..HEAD` 범위 리뷰). 확인할 곳: `batchRun.ts`(레이트리밋·연결 종료 분기), `refreshSources.ts`(결정 반영), `reviewItems.ts`/`pipelineRepo.ts`(N+1 — 50개사라 지금은 괜찮지만 include 가 큼), `review-block.tsx`(액션 결과 처리), `dashboard/page.tsx`(집계 호출 8개 병렬화 여지).
- [ ] 알려진 결함 하나: 기업 상세 `<OpinionCitations>` 팝오버가 표 폭을 넘으면 잘릴 수 있음(`w-[360px]` 절대 배치) — 실물에서 확인.

## 3. API 미활용 후속 4건 (각 1~2시간, `docs/2026-08-30-api-response-fields.md` "반영 현황" 아래 목록)

- [ ] **국세청 `end_dt` 를 휴·폐업 사건 날짜로** — `eventRules.ts` `extractSourceEvents` 의 `closure` 이벤트 `occurredAt: snap.fetchedAt` → payload `closedAt` 우선. 테스트: `eventRules.test.ts`.
- [ ] **연금 탈퇴일 사건** — payload `withdrawnAt` 이 있으면 `kind: "closure"`(또는 새 kind `nps_withdrawn`, `KIND_LABEL` 추가) 경보. 테스트 같은 파일.
- [ ] **업종명 보완** — `Company.industry` 가 비었거나 숫자 코드(`/^\d+$/`)면 벤처 `업종명(11차)` → 연금 `vldtVlKrnNm` 순으로 채우는 서비스 + `refreshSources` 에서 호출. 올림플래닛 `58222` 정리. `rubrics.json` 별칭에 새 업종명 추가.
- [ ] **금융위 항상 호출** — `collectEvidence.ts:47` 조건 제거하고 `sourceEvidence.fsc()` 요약을 "번호 일치/불일치"로. 사업자번호 교차 검증 사건(불일치 → `source_conflict`) 추가.

## 4. Phase B 마감 — Task 14 연도별 이력·시상 (플랜부터 작성)

- 로드맵 §Task 14. 재료는 갖춰짐: 랭킹 총점(`rankCompanies`), 재무 전년비(`companyFacts.finance.growth`), 산식 버전(`rubrics.json.formulaVersion`).
- 설계 요점: `SelectionRecord{companyId, year, grade, total, metricsJson, formulaVersion, decidedAt, decidedBy}` · 시상 확정 액션은 `/ranking` 에 "시상 확정" 1개(primary CTA 는 엑셀 내보내기와 충돌 — 확정은 `signal-outline`, 확정 모달 안에서 primary) · `/history` 페이지: 기업별 점수 추이 라인(Recharts, 홈의 `headcount-trend` 문법) · 카테고리 자동 산출 순수 함수 `awards.ts`("3년 연속 우수" = 3개 연도 연속 상위 n · "전년 대비 최다 성장" = 총점 증가 최대 · "신규 최고 점수" = 첫 등록 연도 총점 최고) · 연간 집계 피벗(기업×월×종류). 내비에 `04 이력` 탭.
- 플랜 파일명 `docs/superpowers/plans/2026-09-0X-history-awards.md`, 커밋 메시지 `feat: selection history tracking and award categories`.

## 5. 리포트·실행 이력 화면 F (Task 14 뒤)

- 실행 이력 표(`AnalysisRun` — 실행일시·기업 수·기사 수·판정·토큰 `usageJson`·엑셀 링크) · 월간 문서 목록 · 제출 자료 보관함(파일명·제출일·해시; 새 모델 `Submission`). `/reports`, 내비 `05 리포트`.

## 6. 그 다음

- 배포(Task 16): SQLite→PostgreSQL, `batchRegistry`(프로세스 메모리)를 DB 로, 스케줄러는 두지 않기로 결정됨(수동 실행).
- 사이드카·딥리서치(3·6·15), RAGAS 튜닝(15b).
- 디자인 잔여: 홈 모바일·다크·상태 변형 시안, 컴포넌트 시트·브랜드 보드(파비콘·월간 문서 표지 워드마크), 지도·지역 그리드 거취 결정(현재 어느 화면에도 없음).

## 결정 기록 (되묻지 않기)

- 방향 B「신호」· 워드마크 B(절개 렌즈) 채택. 메뉴는 좌측 책갈피 탭, 본문 폭 1024 유지.
- 사건 이력은 읽기 전용 표 1행/사건, 확인·메모는 "확인 필요" 블록에서만(경보·주의만).
- 뉴스 분석 실행은 상세에서 빼고 `/companies` 일괄 실행 패널로. 자동 스케줄 없음.
- 홈 헤드라인 없음(A2 파이프라인 밴드), 리본은 기준일 3 + 할 일 3.
- 근거일치 임계는 코드 원천 `0.5`(브리프 §3 의 0.4 는 낡음).
- 뉴스 수집 기본 기간 최근 90일.
