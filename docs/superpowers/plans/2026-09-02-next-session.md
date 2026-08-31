# 다음 세션 인계 — 2026-09-02

> 이 문서 → `CLAUDE.md` → 마스터 로드맵 순으로 읽는다. superpowers TDD, 커밋은 한 명령에 하나씩(훅이 전체 스위트 실행), 새 실패 테스트 파일을 만든 채로 다른 커밋을 하지 않는다.

## 0. 2026-09-01 세션에서 끝난 것

- **§1 재적재**: 원천 대조 56/56 2회(신 코드 반영). 업종 6건 자동 보완(전부 ICT 매핑), 금융위 39 일치·7 불일치(동명 의심 — 미타운 등, 확인 필요 블록에서 판정할 것).
- **§3 API 후속 4건**: 국세청 `end_dt`→폐업 사건 날짜 · 연금 탈퇴 경보(`연금 사업장 탈퇴`) · 업종명 보완(`industryBackfill.ts`, 벤처→연금 순, refreshSources 에서 호출) · 금융위 항상 호출+번호 대조(불일치→conflict→동명 충돌 사건).
- **Task 14 완료**: `SelectionRecord`(연도×기업 unique, 등급·총점·순위·지표 JSON·산식 버전) · `/ranking` "시상 확정" signal-outline+모달 · `/history`(01 시상 카테고리 `awards.ts` — 3년 연속 우수/최다 성장/신규 최고 · 02 점수 추이 facet 라인 · 03 사건 기업×월 피벗 `eventPivot.ts`) · 내비 04. 2025년 48건 확정 저장 실증. 플랜: `2026-09-01-history-awards.md`.
- **화면 F 완료**: `/reports`(01 실행 이력 `listRunHistory` — 기사·판정·토큰·엑셀 링크 · 02 월간 문서 링크 · 03 제출 보관함 `Submission` 모델+업로드 액션 sha-256, 파일은 `data/submissions/`) · 내비 05. 플랜: `2026-09-01-reports-screen.md`.
- **§2 코드 리뷰 반영 — 확정 결함 10건 전부 수정**(각 회귀 테스트 포함):
  1. 뉴스: 기사 1건의 깨진 날짜가 수집원 전체를 죽이던 것 → 건별 스킵
  2. 뉴스: 시작·종료일이 UTC 자정 → KST 하루 경계(마감일 오후 기사 소실 해결)
  3. 뉴스: 중복 제거를 같은 언론사 안으로 한정(통신 기사 받아쓰기 보존)
  4. 뉴스: 리드 판정을 띄어쓰기 무시 패턴으로(`firstMentionIndex`)
  5. 벤처확인 `rows[0]` 동명 폴백 제거(정확 일치만)
  6. 국세청 휴업(02)을 폐업으로 적던 것 → `휴업 · …`
  7. DART 재무가 운영자 확정 corpCode 를 무시 → hint 전달, `dart:none` 이면 재무 스킵. `scripts/collect-sources.ts` 는 `refreshSourcesFor` 재사용으로 통일
  8. 뉴스만 수집한 `collected` 런이 미검토 needs_review 를 가리던 것(reviewItems·pipelineRepo)
  9. 배치 "이미 검증됨" 스킵이 verification 존재만 보던 것 → status verified 만
  10. 인용 수가 수집 전체 기사 수 → primary 만
- **기타**: OpinionCitations 팝오버를 문단 앵커로(잘림 해소) · U1 UTC 날짜 슬라이스 3곳 kst 헬퍼로 교체.
- **56개사 전체 분석 배치 완료(수정된 수집기)**: 52 verified · 2 needs_review(24·34) · 2 no_news(이퀄라이저 52·그리너리 54 — 별칭 입력 필요).
- **추가 반영(사용자 요청)**: 금융위 번호 불일치도 결정 대상(`fsc_conflict` 항목, 수용/동명 배제) · 기업 상세 헤더를 데이터 길이 맞춤 key-value 4열 표로 · 사건 피벗에 설명 캡션+한국어 종류 요약 열+데이터 폭 · **시상 확정 기간 단위(연간/반기/분기, `SelectionRecord.period` 마이그레이션+backfill)** · 점수 추이를 월 축(기간 끝 달)으로.
- **동명 검증 요청 품질 분석 결과(반영 대기)**: 11건 중 유효 5건 — fsc `includes` 폴백 오탐 3(미타운·케이씨에스·SDT), DART startsWith SPC 후보 2(페어리식사제일차·이퀄라이저유동화), 연금 numberMismatch 를 후보 선택으로 묻는 문제(SDT), 결정 항목과 source_conflict 사건의 이중 요청. 권고 4건은 세션 대화 기록 참조.

## 1. 첫 30분

- [ ] `/history` 2025 탭이 확정 48건으로 그려지는지, 재확정 필요하면 `/ranking` → 시상 확정.
- [ ] 사람 판단 UI 작업(자동화 불가): SDT(29) 연금 후보 확정 · 써로마인드(14)/이퀄라이저(52)/페어리(4) DART 후보 판정 · **금융위 번호 불일치 7건**(미타운 등) 확인 · 이퀄라이저·그리너리 검색 별칭 입력.

## 2. 남은 리뷰 낙수 (선택, 각 30분 내)

리뷰가 확정했지만 10건 캡에 잘린 것들: id 파라미터 NaN → 500(5개 엔드포인트+기업 상세) · `Number(null)===0` 으로 year 400 우회 · batch-runner `setBusy` 경합 · no_news 런이 스테퍼 "done" 에 못 가는 것 · verification_failed 가 검토 필요로 표시 · NPS 이름 검색 1페이지(100행)만 · `dart.ts:88` hint 시 stockCode null 고정 · 정리 5건(원천 라벨 맵 중복·JSON parse 헬퍼 8벌·억 포맷터 4벌·data.go.kr 보일러플레이트·tsconfig backup 제외).

## 3. 그 다음 (로드맵 순)

- 배포(Task 16): SQLite→PostgreSQL, `batchRegistry` 를 DB 로, 스케줄러 없음(결정).
- 사이드카·딥리서치(3·6·15), RAGAS(15b).
- 디자인 잔여: 홈 모바일·다크 시안, 컴포넌트 시트, 지도·지역 그리드 거취.

## 결정 기록 (기존 + 이번 세션)

- 기존 결정은 `2026-09-01-next-session.md` 하단 그대로 유효.
- 등급 규칙: 순위 상위 10 = 우수, 나머지 = 선정(`awards.ts EXCELLENT_TOP_N`). 총점 없는 기업은 이력에 저장하지 않는다.
- 시상 확정은 서버 재계산으로 동결(클라이언트 표 불신), (기업,연도) upsert — 재확정은 덮어씀.
- 제출 보관함은 파일 자체를 `data/submissions/`(gitignore)에 두고 DB 에는 파일명·해시·크기·메모만.
- prisma migrate 후에는 반드시 `npx prisma generate` + `npm run db:migrate:test` + **dev 서버 재시작**(클라이언트 싱글턴 캐시).
- 뉴스 중복 제거는 언론사 내에서만 — 매체 수 자체가 신호라는 판단.
