# 성과돋보기 (businessTrace)

뉴스와 공공·금융 데이터를 AI 로 분석해 **우수기업 선정 근거를 만들고, 그 근거를 공식 출처와 대조해 자동 검증**하는 관리자 도구다.
한국방송통신전파진흥원 ICT기금사업 우수기업(연 50개사) 평가위원회에 다차원 분석자료를 제공한다.
제품의 존재 이유는 **AI 환각 방지** — 분석 결과는 기사 원문과 공식 출처로 검증되지 않으면 통과하지 못한다.

## 무엇을 하나

```
수집 ─▶ 정제 ─▶ 분석 ─▶ 검증 ─▶ 산출
뉴스 2종      본문 추출     LLM 다차원    3중 임계값     대시보드 · 기업 상세
공공데이터 9종  중복 제거     근거 문장 인용  원문·출처 대조  엑셀 3시트 · 월간 문서 · 랭킹
```

**검증 게이트** — 세 조건을 모두 넘어야 `verified`, 하나라도 미달이거나 조회 실패·오류·판정 불가면 예외 없이 `needs_review` 다. 판정은 모델이 아니라 코드가 임계값 비교로 수행한다.

| 층 | 무엇을 보나 | 임계값 |
|---|---|---|
| ① 출처 인용 | 분석 항목 중 언론 기사 링크가 달린 비율 (차단 출처는 미인용) | 출처 커버리지 ≥ 0.5 |
| ② 사실 부합 | 주장이 기사 내용과 맞는 정도 — LLM judge, 기사 원문만 근거 | 근거 충실도 ≥ 0.85 |
| ③ 원문 실재 | 인용한 문장이 기사 본문에 실제로 있는 비율 — LLM 없이 계산 | 근거 일치도 ≥ 0.5 |

**랭킹(`rank-v2`)** — 감성 · 수상 · 투자 · 재무 · 성장 · 검증 6축 가중합에 확정 리스크 건당 감점. 재무는 절대값이 아니라 **1인당 매출**, 성장은 매출 증가율 · 고용 증감 · 입·퇴사 순증 · 조달 수주 추이 4신호를 각각 정규화한 평균이다(고용 계열은 한 묶음). 못 잰 신호는 0 이 아니라 결측으로 가중치에서 빠진다. 업종(ICT · 제조 · 바이오)별 가중치는 `src/lib/services/rubrics.json`.

## 데이터 원천

공공데이터 9종은 전량 공공데이터포털 무료 개방 API 다 — 별도 구독료가 없다.

| 구분 | 원천 | 확보 항목 |
|---|---|---|
| 뉴스 | 네이버 뉴스 검색(API HUB) · 구글 뉴스 RSS | 제목 · 본문 · 발행일 · 언론사 |
| 식별 | OpenDART 기업개황 · 금융위원회 기업기본정보 | 사업자등록번호 · 대표 · 업종 |
| 재무 | OpenDART 재무제표 | 매출 · 영업이익 · 순이익 · 자산 |
| 신뢰성 | 국세청 휴폐업 | 계속사업자 여부 |
| 실적 | 나라장터 조달업체 · 낙찰 정보 | 종업원수 · 공공조달 수주 |
| 인증 | 중소벤처기업부 벤처기업명단 | 벤처확인 유형 · 유효기간 |
| 고용 | 국민연금공단 가입 사업장 | 가입자수 · 입·퇴사 (월 스냅샷 자체 누적) |
| 분석 엔진 | Anthropic Claude (기본) · OpenAI (`LLM_PROVIDER=openai`) | 분석 · 검증 judge · 반증 |

원천별 함정(인증 방식 · 에러 코드 · 동명 기업 오인 방지 규칙)은 `CLAUDE.md` 와 `.claude/skills/external-apis` 에 있다.

### 출처 신뢰 규칙

- `src/lib/services/pressMapping.json` — 도메인 → 언론사명 497건. 표시용이며, 목록에 없는 도메인도 인용은 유지하고 화면에 「출처 미등록」으로 표시한다.
- `src/lib/services/pressBlocklist.json` — 언론 보도가 아닌 도메인(테마주·투자정보 사이트, 블로그·커뮤니티·SNS, 기업 보도자료 유통망, 채용·투자 DB). 수집 단계에서 제외하고, 검증 게이트에서도 미인용으로 센다. 하위 도메인과 구글 RSS 의 `source url` 까지 본다.

## 시작하기

Node 24, npm. 데이터베이스는 SQLite(Prisma)이며 PostgreSQL 전환이 예정돼 있다.

```bash
cp .env.example .env        # 키를 채운다 — 아래 표
npm install                  # postinstall 에서 prisma generate
./scripts/dev.sh             # 환경 점검 + 마이그레이션 + 개발 서버 (권장)
npx tsx scripts/create-admin.ts   # 관리자 계정 발급 — 공개 회원가입은 없다
```

| 환경변수 | 용도 |
|---|---|
| `DATABASE_URL` · `AUTH_SECRET` · `AUTH_TRUST_HOST` | DB · 세션 |
| `LLM_PROVIDER` · `ANTHROPIC_API_KEY` · `ANTHROPIC_MODEL` / `OPENAI_API_KEY` · `OPENAI_MODEL` | 분석 엔진. 모르는 공급자 값은 기동을 막는다 |
| `NCP_APIGW_API_KEY_ID` · `NCP_APIGW_API_KEY` | 네이버 뉴스 검색 |
| `DART_API_KEY` · `NTS_SERVICE_KEY` | OpenDART · 공공데이터포털(국세청 · 나라장터 · 금융위 · 벤처 · 국민연금 공용) |

```bash
npm run build     # 프로덕션 빌드 (타입 체크 포함)
npm run lint      # ESLint
npm test          # vitest — 외부 API 는 전부 mock, 네트워크 의존 테스트 없음
```

## 배치 스크립트

화면은 기업 단위 실행만 하고, 대량 작업은 `scripts/` 로 돈다.

| 스크립트 | 무엇 | 주기 |
|---|---|---|
| `analyze-all.ts [연도] [기사수] [기업명,…] [--force] [--since=YYYY-MM-DD]` | 활성 기업을 수집 → 분석 → 검증. 검증된 기업은 `--force` 없이 건너뜀 | 필요 시 |
| `collect-sources.ts` | 공식 원천 7종 재조회 | 분석 전 |
| `collect-pension.ts <연도>` | 국민연금 가입 사업장 월 스냅샷 적재 — 원천이 12개월치만 유지하므로 거르면 그 달은 복구 불가 | 매월 15일 이후 |
| `collect-procurement.ts [개월]` | 나라장터 낙찰 전수 스캔 후 사업자번호로 필터. 12개월에 약 40분 | 월 1회 |
| `collect-venture.ts` | 벤처기업명단 전수 적재 | 분기 1회 |
| `import-companies.ts` · `monthly-report.ts` · `backfill-events.ts` · `dedupe-events.ts` | 기업 목록 등록 · 월간 문서 · 사건 보정 | 필요 시 |

## 배포

서버에서 Node 를 직접 돌린다 — **systemd 유닛 + nginx**, 도커는 쓰지 않는다. 배포 · 백업 · 환경변수 게이트 · 정기 작업은 [`deploy/README.md`](deploy/README.md).
보안(SSRF · 레이트리밋 · 프롬프트 인젝션 · 세션 · 보안헤더 · 라우트 인가)과 구조화 로그는 적용돼 있고, 남은 것은 서버 실기동 · CSP `script-src` nonce · PostgreSQL 전환이다 — [`docs/2026-09-03-production-readiness.md`](docs/2026-09-03-production-readiness.md).

## 코드 구조

```
src/app/(app)/         화면 · Route Handler (얇게)
src/lib/services/      외부 API · 도메인 로직 — 수집 · 분석 · 검증 · 벤치마킹 · 리포트
src/lib/repositories/  DB 접근 (Prisma)
src/components/        shadcn/ui + 화면 조립
scripts/               배치 · 운영 스크립트 (Python 은 여기에만)
deploy/                systemd · nginx · 배포/백업 스크립트
docs/                  플랜 · 스펙 · 사고 기록(incidents.md) · 발표자료
```

플랜 주도로 개발한다 — 로드맵 `docs/superpowers/plans/2026-08-26-nextjs-rearchitecture.md`, 실행 플랜 `docs/superpowers/plans/2026-08-26-phase0-core-loop.md`. 코드 작성 규약은 `CLAUDE.md`.
