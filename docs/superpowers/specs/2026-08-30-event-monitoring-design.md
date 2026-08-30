# 사건 중심 모니터링 — 설계

2026-08-30. 브리프 `docs/2026-08-28-consulting-brief.md` §1.1 (관리) 항목과 §3.2 ④ 사용성 5/100 에 대한 응답.

## 왜

과제카드의 두 번째 추진내용 **(우수성과 관리)** 는 "과년도 우수기업의 성과 데이터를 DB화해 차년도 예산 검토 기초자료로" — 연중 모니터링이다. 담당자(기금기획팀)는 **월 1회** 열어 보고, 확인한 내용을 ① 상부 보고 ② 성과 DB 누적 ③ 기업 접촉·후속 조치 ④ 홍보 소재 발굴에 쓴다.

현 대시보드는 첫 화면부터 "검증 통과 40 / 검토 6" 을 보여준다. 이는 **AI 산출물의 신뢰도**이지 **기업에 무슨 일이 있었는가**가 아니다. 기사·판정·스냅샷은 있으나 "사건"이라는 개념이 없어 담당자가 기사 20건과 점수를 머릿속에서 조립해야 한다. 이 스펙은 **사건(Event)을 1급 데이터**로 두고, 네 용도를 전부 사건에서 파생시킨다.

## 결정 (승인 완료)

1. 사건 9종·임계값·중복 제거 키·신뢰 배지 규칙 (§1)
2. `Event` 테이블 하나가 성과 DB 다 — 별도 집계 테이블 없음 (§2)
3. 판정 타일은 대시보드 04 "데이터 신선도"로 내린다; `/companies` 는 카드 그리드가 되고 등록은 모달로 (§3)
4. 후속 조치 3단계 미확인→확인→조치완료; 월간 문서 5시트, 요약은 템플릿(LLM 없음); 연간 집계는 인터페이스만; `actionItems` 삭제 (§4)

---

## §1 사건 정의

사건은 **규칙으로만** 추출한다. LLM 을 쓰지 않으므로 근거가 항상 기존 데이터에 있다.

| kind | 트리거 | severity | evidenceKey | 근거(evidenceJson) |
|---|---|---|---|---|
| `award` | 분석 `award.is_award_related === "Y"` 이고 `isAboutCompany` | `positive` | 기사 link | `[{label: award_name, link}]` |
| `investment` | 분석 `investment.is_investment_related === "Y"` 이고 `isAboutCompany` | `positive` | 기사 link | `[{label: investment_name, link}]` |
| `positive_press` | 분석 `sentiment_score >= 6` 이고 `isAboutCompany` | `positive` | 기사 link | `[{label: 기사 제목, link}]` |
| `negative_press` | 분석 `sentiment_score <= -4` 이고 `isAboutCompany` | `notice` | 기사 link | `[{label: 기사 제목, link}]` |
| `headcount_up` | 연금 최신 ym 가입자가 직전 ym 대비 `>= +20%` 또는 12개월 전 대비 `>= +20%` | `positive` | 최신 `ym` | `[{label: "63 → 76명", ym: [from, to]}]` |
| `headcount_down` | 위와 대칭 `<= -20%` | `notice` | 최신 `ym` | 동일 |
| `closure` | 국세청 스냅샷 summary 가 `폐업` 또는 `휴업` 으로 시작 | `alert` | `nts:` + summary 앞 토큰 | `[{label: summary, source: "nts"}]` |
| `venture_expiry` | 벤처 스냅샷 `payload.validUntil` 이 오늘+60일 이내 또는 과거 | `notice` | `venture:` + validUntil | `[{label: "유효기간 2026-10-01 까지", source: "venture"}]` |
| `source_conflict` | 원천 스냅샷 `status === "conflict"` (CONFLICT_STAGES 만) | `notice` | `{source}:conflict` | `[{label: summary, source}]` |
| `silence` | 30일 이상 primary 기사 없음 — **저장하지 않고 렌더 시 계산** | `info` | — | 최신 기사일 |

- `occurredAt`: 기사 `published` / 연금 `ym` 의 말일 / 원천 `fetchedAt`
- **신뢰(trust)**: 분석 4종만 그 실행의 검증 판정을 물려받는다 — `verified` → 배지 "근거 확인", `needs_review` → "확인 필요". 연금·원천 사건은 실측이라 `null` (배지 "실측")
- 임계값은 `src/lib/services/eventRules.ts` 상수: `POSITIVE_PRESS_MIN = 6`, `NEGATIVE_PRESS_MAX = -4`, `HEADCOUNT_RATIO = 0.2`, `VENTURE_EXPIRY_DAYS = 60`, `SILENCE_DAYS = 30`(= `newsCoverage.STALE_DAYS` 재사용). 첫 달 실측 뒤 조정
- 동명 일반명사(아크릴) 오염은 `isAboutCompany` 게이트와 primary 필터가 막는다. 추가 규칙 없음

### severity 순서

`alert` > `notice` > `positive` > `info`. 정렬·집계·헤더 문장에 공통으로 쓴다. `src/lib/services/eventRules.ts` 에 `SEVERITY_ORDER` 로 둔다.

---

## §2 데이터 모델

```prisma
model Event {
  id           Int       @id @default(autoincrement())
  companyId    Int
  company      Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  kind         String
  severity     String
  occurredAt   DateTime
  title        String
  evidenceKey  String
  evidenceJson String
  runId        Int?
  run          AnalysisRun? @relation(fields: [runId], references: [id], onDelete: SetNull)
  trust        String?
  status       String    @default("open")
  note         String?
  reviewedAt   DateTime?
  reviewedBy   Int?
  createdAt    DateTime  @default(now())

  @@unique([companyId, kind, evidenceKey])
  @@index([occurredAt])
  @@index([companyId, status])
}
```

`Company` 와 `AnalysisRun` 에 역관계 `events Event[]` 추가. 마이그레이션 이름 `event_monitoring`. `resetDatabase()` 에 `event.deleteMany()` 추가.

**upsert 규칙** (`src/lib/repositories/eventRepository.ts`): 같은 `(companyId, kind, evidenceKey)` 가 있으면 `title/evidenceJson/trust/runId/occurredAt` 만 갱신하고 **`status/note/reviewedAt/reviewedBy` 는 보존**한다. 재분석·재수집이 담당자의 처리 기록을 지우지 않는다.

### 리포지토리 인터페이스

```ts
upsertEvents(events: NewEvent[]): Promise<{ created: number; updated: number }>
listEvents(input: { year: number; since?: Date; until?: Date; kinds?: EventKind[]; status?: EventStatus[]; companyId?: number }): Promise<EventRow[]>
reviewEvent(id: number, action: "acknowledge" | "done" | "reopen", note: string | null, userId: number): Promise<EventRow>
summariseEvents(year: number, since: Date): Promise<{ companiesWithEvents: number; bySeverity: Record<Severity, number>; open: number }>
```

---

## §3 화면

### 3-1 대시보드 `/dashboard` — 지난 30일 동향

```
헤더  킥커 "{year}년 우수기업 · 지난 30일 동향"
      h1 "이달의 동향"
      요약 "50개사 중 12개사에 사건 · 주의 3 · 경보 0 · 홍보 후보 7 · 미확인 9"   ← summariseEvents + 템플릿
      타일 연금 스냅샷 · 마지막 분석 (현행)  +  [월간 문서 내려받기 ▾ 이번 달 / 지난 달]
리본  현행 freshness 항목에서 `조치 n` → `미확인 사건 n` 으로 교체, `낡은 근거 n` 유지

01 이달의 사건          컨트롤: 기간(30일/90일) · 종류(멀티) · 미확인만 토글 — 클라이언트 상태
   행: 날짜 · 기업(링크) · 심각도 아이콘+kind 라벨 · title · 신뢰 배지 · 상태 · [확인] [조치완료]
   정렬: severity → occurredAt desc. 페이지 20행
   빈 상태: "지난 30일 사건 없음 · 마지막 사건 {날짜}"

02 주의 기업 ‖ 03 홍보 후보 (2단)
   02: alert·notice 사건 보유 기업 칩 + 사건 수, 클릭 → /companies/[id]
   03: positive 사건 보유 기업 칩 + 사건 수 + [근거 링크 복사]

04 데이터 신선도 (details/summary, 기본 닫힘)
   VerdictBoard(판정 4타일) + CompanyPipelineGrid(현행 매트릭스) 그대로 이동
```

- 상태 전이 버튼은 Server Action `reviewEventAction(formData)` — 낙관적 갱신 후 `revalidatePath("/dashboard")`
- `silence` 는 `buildNewsCoverage` 로 렌더 시 계산해 01 에 `info` 행으로 섞는다(저장 없음)
- 제거: 03 조치 필요(`ActionList`·`actionItems.ts` 삭제), 04 최근 기사(사건이 대체; `RecentArticles` 파일은 보존)

### 3-2 기업 카드 `/companies`

현 표 페이지를 **카드 그리드**로 교체. 등록(`CompanyBulkForm`)은 상단 `[기업 등록]` 버튼 → 모달(shadcn `Dialog`)로 이동. `CompanyTable` 은 모달 안 "등록된 기업 관리"로 남긴다.

```
[기업 등록]   정렬 봐야 할 순서 ▾   필터 ☐ 주의만 ☐ 홍보 후보만 ☐ 사업자번호 미확보

┌ 딥노이드                      근거 확인 ┐
│ 의료AI · 가입자 89명 ▲4%                 │
│ ★ 수상 1 · 투자 0 · ▲ 부정 0            │  ← 30일 사건 집계
│ 최근 보도 08-26                          │
│ [미확인 1]                               │  ← open 사건 수, 0이면 생략
└──────────────────────────────────────┘
```

- 카드 데이터 `CompanyCardData`: `{ id, name, industry, businessNo, headcount: {latest, delta12m}, latestArticle, events30d: Record<Severity, number>, open, worstSeverity, trust }` — 서비스 `buildCompanyCards(year, now)` 가 `listEvents` + 연금 + 뉴스 커버리지를 합친다
- 정렬 "봐야 할 순서": `worstSeverity`(alert 먼저) → `open` desc → 이름. 그 외 이름순·최근 보도순
- 심각도는 카드 좌상단 **아이콘+텍스트**(색 보조). 카드 셸은 `Card variant="comic"`
- `[미확인 n]` 은 `Badge variant="ink"`

### 3-3 기업 상세 `/companies/[id]` — 사건 이력

기존 섹션(원천 대조 · 인원 추이 · 분석 실행기) 위에 **사건 이력** 섹션:

```
사건 이력   [12개월 ▾ 전체]
  2026-08-28  ▲ 부정 보도  자본잠식 우려 …  [기사]   확인 필요   ○ 미확인   [메모] [확인] [조치완료]
  2026-07-31  ▼ 인원 −31%  63 → 41명           실측        ● 조치완료  "본사 이전 확인(8/5)"
```

- 메모는 인라인 편집(한 줄), 저장은 같은 Server Action
- `AnalysisRunner` 완료 이벤트 뒤 `router.refresh()` 로 타임라인 갱신

### 항해

`AppShell` 메뉴: `동향`(/dashboard) · `기업`(/companies). "기업 등록" 메뉴 삭제.

---

## §4 후속 조치 · 월간 문서 · 연결

### 4-1 상태 전이

```
open ──acknowledge──▶ acknowledged ──done──▶ done
 ▲                                            │
 └──────────────── reopen ────────────────────┘
open ──done──▶ done   (한 번에 완료 허용)
```

`src/lib/services/eventReview.ts`:
```ts
export type EventStatus = "open" | "acknowledged" | "done";
export type ReviewAction = "acknowledge" | "done" | "reopen";
export function transition(status: EventStatus, action: ReviewAction): EventStatus   // 불허 조합은 throw
```
허용: `open→acknowledge`, `open→done`, `acknowledged→done`, `done→reopen`. 그 외 `InvalidTransitionError`.

### 4-2 월간 문서

`src/lib/services/monthlyReport.ts` — `buildMonthlyWorkbook(input: { year; month; events: EventRow[]; cards: CompanyCardData[]; freshness: FreshnessInput }): Workbook` (exceljs, `reportExcel.ts` 의 스타일 헬퍼 재사용). 순수 함수 — DB 접근은 호출자.

| 시트 | 열 |
|---|---|
| 요약 | 문단 1개(템플릿) + 표: 사건·주의·경보·홍보 후보·미확인·뉴스 수집일·원천 수집일·연금 ym |
| 사건 | 날짜 · 기업 · 종류 · 심각도 · 제목 · 근거 링크 · 신뢰 · 상태 · 메모 |
| 주의 기업 | 기업 · alert 수 · notice 수 · 사건 요약(최대 3) · 미확인 |
| 홍보 후보 | 날짜 · 기업 · 종류 · 제목 · 기사 제목 · 링크 · 출처 |
| 기업 현황 | 기업 · 업종 · 사업자번호 유무 · 가입자 · 12개월 증감 · 최근 보도 · 판정 |

요약 문단 템플릿(`summaryParagraph(stats)`):
> `{month}월 우수기업 {total}개사 중 {companiesWithEvents}개사에서 사건 {events}건. 주의 {notice}건({첫 주의 기업} 외), 경보 {alert}건, 홍보 후보 {positive}건. 미확인 {open}건.`

파일명 `YYYY-MM 우수기업 동향.xlsx`. 진입: 대시보드 버튼(Route Handler `GET /api/reports/monthly?year=&month=`) 과 `scripts/monthly-report.ts YYYY-MM`. 둘 다 같은 빌더. 이메일 발송 없음.

### 4-3 연간 집계 — 인터페이스만

`buildYearlyWorkbook(input: { year; events: EventRow[] }): Workbook` 시그니처와 시트 정의(기업 × 월 × 종류 피벗, 기업별 총계)만 스펙에 두고 **이번 범위에서 구현하지 않는다**(로드맵 Task 14).

### 4-4 파이프라인 연결

| 시점 | 함수 | 사건 |
|---|---|---|
| `runCompanyAnalysis` 가 검증까지 마친 뒤 | `extractAnalysisEvents(run, verification)` → `upsertEvents` | award · investment · positive/negative_press |
| `scripts/collect-pension.ts` 끝 | `extractPensionEvents(series)` | headcount_up/down |
| `scripts/collect-sources.ts` 끝, `RefreshSources` 액션 뒤 | `extractSourceEvents(companyId, snapshots)` | closure · venture_expiry · source_conflict |

추출 함수는 `src/lib/services/eventRules.ts` 의 순수 함수(입력 → `NewEvent[]`). 저장은 호출자가 `upsertEvents`. `no_news`·`failed` 실행은 추출하지 않는다.

**기존 데이터 백필**: `scripts/backfill-events.ts [연도]` — 기업당 최신 완료 실행·전체 연금 시계열·현재 원천 스냅샷으로 한 번 추출. 이번 범위에 포함(없으면 첫 달이 비어 보인다).

---

## 삭제·보존

| 삭제 | 보존(미사용) |
|---|---|
| `services/actionItems.ts` + test, `dashboard/action-list.tsx` + test | `recent-articles.tsx`, `verdict-board.tsx`(04 로 이동), `growth-ranking` 등 기존 고아 컴포넌트 |
| 리본 항목 `조치 n` | `freshness.ts` 나머지 |

## 범위 밖

이메일 알림 · 연간 집계 구현 · LLM 요약 · 다중 팀(`team` 컬럼 두지 않음) · 지도·워드클라우드 복귀

## 테스트

- 규칙: `eventRules.test.ts` — 9종 각각 트리거/비트리거 1쌍, 임계 경계, `isAboutCompany=false` 배제, dedupe 키
- 리포지토리: `eventRepository.test.ts` — upsert 가 status/note 보존, listEvents 필터, reviewEvent 전이·불허
- 전이: `eventReview.test.ts` — 허용 4, 불허 예시 3
- 카드: `companyCards.test.ts` — 집계·정렬·필터
- 문서: `monthlyReport.test.ts` — 5시트 존재, 요약 문단 템플릿, 빈 달
- 화면: `event-table` · `company-card` · `event-timeline` 컴포넌트 테스트(Testing Library)
- 백필 스크립트는 DB 테스트 1건(멱등)

## 리스크

- **사건 과다**: 감성 ≥6 이 흔하면 홍보 후보가 넘친다 — 첫 달 분포를 보고 `POSITIVE_PRESS_MIN` 조정. 상수 한 곳
- **연금 스냅샷 지연**: 매월 15일 이후 적재라 월초 점검엔 전월 인원 사건이 없다 — 리본의 "연금 · 다음 08-15" 가 이를 알린다
- **`/companies` 교체**: 등록 흐름이 모달로 가면서 기존 `company-table` 테스트는 모달 컨텍스트로 이동. 등록 API 는 무변경
