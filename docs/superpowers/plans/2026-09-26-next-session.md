# 다음 세션 인계 — 2026-09-26

> 이 문서 → `CLAUDE.md` → 플랜 `2026-09-26-article-judgments.md`(완료) 순으로 읽는다. **작업 브랜치는 main** 이다(2026-09-25 통합). 원격 push 는 아직 하지 않았다.
> 작업 트리에 사용자의 미커밋 작업(환경변수 관리자 로그인: `env.ts`·`envAccount.ts`·`authenticate.ts`·`.env.example`·`deploy/README.md`·`instrumentation-node.ts` 등)이 있다 — 같은 파일을 고치면 HEAD 에 내 변경분만 얹어 스테이징한다.

## 0. 이번에 끝난 것

- main 통합(fast-forward) · CLAUDE.md 에 "main 에서 작업" 규칙
- **검증 시간 실측** — `docs/2026-09-26-verification-timing.md`. 기존 38.3분 → 신규 기본 19.6분(동시 처리) → Jev 9.5분
- **LLM 결함 수정 `49af984`** — judge 가 `max_tokens` 8000 에 잘려 검증 20~23% 실패, 종합의견은 문자열 속 줄바꿈으로 37~73% 실패. 상한 32000·잘림 명시·제어문자 이스케이프. 실패 7건 재검증 전부 verified
- **06 판정** — `ArticleJudgment`·보류 자동 적재(두 분석기 공통 규칙)·다음 분석 반영·반영 재분석 버튼·게이트 표본 83건 적재(`scripts/import-judgment-gate.ts`)·채점은 DB 판정을 읽는다·대시보드 리본 건수·기업 상세 "03 기사"에서 올리기

## 1. 첫 30분

- [ ] **dev.db 재분석** — run 302–351 은 LLM 수정 전 결과라 종합의견 11건·검증 7건이 실패 상태다. `/companies` 에서 50개사 full·force 로 다시 돌리면서 수정 뒤 배치 시간·검증 실패율을 잰다(비용 약 5~6달러)
- [ ] **게이트 판정** — 06 판정에서 "모든 경로 → 게이트"로 걸러 필수 53건을 판정 → `npx tsx scripts/eval-jev-gate.ts --score-only`
- [ ] 06 판정 화면을 브라우저로 한 번 써 본다(키보드·모델 답 공개·반영 재분석) — 이번 세션은 컴포넌트 테스트와 빌드로만 확인했다

## 2. 그다음

- judge 출력 줄이기(주장 번호로 답하기) — 수정 뒤 큰 기업 검증이 57~132초
- Jev 경로 검증 시간 재측정(종합의견 실패가 교란했다)
- 야간 `SCHEDULE_NEWS_STAGE` 기본값 결정(수집분을 아무도 읽지 않는다 — 2026-09-25 인계 참고)
- `docs/2026-09-03-production-readiness.md` §3-2 잔여
