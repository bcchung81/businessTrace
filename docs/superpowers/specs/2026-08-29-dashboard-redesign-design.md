# 대시보드 재구성 — 근거 준비 현황판

2026-08-29. 목업: https://claude.ai/code/artifact/bee8f5ea-c1fe-49ae-84bb-7fe9191a2dd1

## 왜

현 `/dashboard` 는 4개 섹션 중 2개가 국민연금 하나에 붙어 있고(증감 랭킹·워드클라우드), 나머지는 지도와 기업 구분 없는 기사 피드다. 제품의 존재 이유인 **환각 검증 판정**이 화면에 한 칸도 없다. 운영자(기금기획팀)가 열고 묻는 "어느 기업이 준비됐고, 어디가 막혔고, 오늘 뭘 해야 하나"에 답하지 못한다.

외부 조사(925 Studios·Think.Design·Fuselab·Pencil & Paper, 2026)의 공통 결론은 **밀도가 아니라 우선순위**, **위=상태 / 중=변화 / 아래=상세**의 3층, **색만으로 상태를 말하지 않기**, **비교 기준 없는 숫자 금지**다. 이 설계는 그 원칙을 이 제품의 어휘(verified·review·risk·대조 가능성)로 옮긴 것이다.

## 1차 독자

운영자. 평가위원용 화면은 별도 과제다. 대시보드는 **읽는 화면**이되 운영자 화면이므로 미분석 기업으로 가는 실행 진입점 하나는 둔다 — 실행 자체는 기업 상세의 `AnalysisRunner` 가 한다.

## 우선순위와 범위

A → B → C → D 순서로 구현한다. 각 단계는 독립 커밋이며 앞 단계 없이 뒤 단계를 시작하지 않는다. E 는 선택이며 이 스펙의 플랜에 넣지 않는다.

| 단계 | 내용 | 대시보드 외 효과 |
|---|---|---|
| A | 상태 토큰 3단 확장, `--review` 색 이동 | 기업 상세·목록 즉시 반영 |
| B | `Panel` 프리미티브 | 카드 문법 통일 |
| C | `VerdictPill` 프리미티브 + 판정 롤업 서비스 | 기업 상세 헤더에서 재사용 |
| D | `/dashboard` 6섹션 재구성 | 본 작업 |
| E | 직전 실행 대비 증감 | 후순위, 별도 스펙 |

## A. 토큰 — `src/app/globals.css`

상태 4종을 각각 **text · surface · fill** 3단으로 둔다. 지금은 text·surface 2단이라 막대·세로선을 그릴 색이 없다.

```css
--verified: #009632;        --verified-surface: #f2fff6;  --verified-fill: #009632;
--review:   #b85c00;        --review-surface:   #fff6e8;  --review-fill:   #ff9200;
--risk:     #d92b2b;        --risk-surface:     #fff0f0;  --risk-fill:     #d92b2b;
--pending:  #5a5c63;        --pending-surface:  #f4f4f5;  --pending-fill:  #c9cbd0;
```

- `--review` 텍스트는 흰 배경 AA(4.5:1)를 지키는 선에서 `--chart-3`(`#ff9200`)과 같은 주황 색상군으로 옮긴다. 갈색 `#b36600` 은 주황 fill 과 같은 상태로 읽히지 않았다
- `--pending` 은 신설. 매트릭스 "미조회"와 판정 "미분석"이 같은 문법을 쓴다
- `@theme inline` 에 `--color-*-fill`·`--color-pending*` 을 등록한다
- `.dark` 에도 같은 키를 채운다 — 값은 기존 `.dark` 상태색을 기준으로 fill 만 한 단계 밝게
- `--cloud-*` 4개는 워드클라우드가 대시보드에서 빠지면 미사용이 되지만 이번엔 삭제하지 않는다 (컴포넌트 보존 원칙과 같음)

**테스트**: `design-primitives.test.tsx` 에 CSS 변수 존재 검사를 추가한다 — `globals.css` 를 읽어 12개 키가 `:root` 와 `.dark` 양쪽에 있는지.

## B. `Panel` — `src/components/dashboard/panel.tsx`

`SectionHead` + 본문 + 푸터를 한 컴포넌트로 묶어 카드 문법을 고정한다.

```tsx
<Panel
  index="04"                 // 섹션 번호, primary 모노. 생략 가능
  title="기업별 근거 매트릭스"
  tag="실측" tone="plain"    // SectionHead 그대로
  note="봐야 할 순서로 정렬"  // 제목 옆 한 줄. 생략 가능
  aside={<Sort … />}         // 제목 줄 오른쪽 슬롯
  footer={<Legend … />}      // 카드 하단, bg-surface 띠
  empty="등록된 기업이 없습니다."  // children 이 null 이면 대시 테두리 빈 상태
>
  {children}
</Panel>
```

- 고정값: 카드 `rounded-[10px] border border-border bg-background shadow-[0_1px_2px_rgba(23,23,25,0.04)]`, 본문 패딩 없음(테이블이 가장자리까지 닿아야 하므로 — 패딩이 필요한 본문은 호출자가 준다), 푸터 `border-t bg-surface px-3.5 py-2 text-[11px]`
- `SectionHead` 는 유지하되 `index` prop 을 추가한다. `Panel` 은 내부에서 `SectionHead` 를 쓴다
- 기존 `GrowthRanking`·`CompanyPipelineGrid`·`RecentArticles` 의 자체 테두리·빈 상태 문구는 제거하고 `Panel` 로 감싼다. `CompanyPipelineGrid` 의 범례+페이지네이션 줄은 `footer` 로 옮긴다
- 높이는 `Panel` 이 정하지 않는다. 2단 그리드에서 높이를 맞추는 건 호출자의 `h-[26rem]` 과 본문의 `min-h-0 overflow-y-auto` 가 한다

**테스트**: `panel.test.tsx` — index·title·tag 렌더 / aside·footer 슬롯 / children null 이면 `empty` 문구 / footer 없으면 푸터 DOM 없음.

## C. 판정 — 서비스 + `VerdictPill`

### C-1. `src/lib/services/verdictRollup.ts`

검증 파이프라인의 상태는 `verified | needs_review` 둘뿐이다(`verificationScores.ts`). 대시보드의 4분류는 여기서 **파생**한다.

```ts
export type Verdict = "verified" | "review" | "risk" | "pending";

export type CompanyVerdict = {
  companyId: number;
  name: string;
  verdict: Verdict;
  faithfulness: number | null;
  sourceCoverage: number | null;
  evidenceMatch: number | null;
  citations: number;           // 검증 시점 인용 가능 기사 수
  counterEvidence: number;     // 반증 건수
  conflicts: string[];         // 파이프라인 conflict 셀의 stage key
  runAt: string | null;        // 최신 완료 실행 시각
};

export type VerdictSummary = {
  companies: CompanyVerdict[];
  counts: Record<Verdict, number>;
  gates: { source: number; faithfulness: number; evidence: number; analysed: number };
  gateDropouts: { source: number; faithfulness: number; evidence: number };
};

export function rollupVerdicts(input: {
  companies: Array<{ id: number; name: string }>;
  verifications: Array<VerificationRow>;   // 기업당 최신 완료 실행의 검증 결과
  pipeline: CompanyPipelineRow[];
}): VerdictSummary
```

판정 규칙 (위에서부터 첫 일치):

1. 완료된 분석 실행이 없다 → `pending`
2. `counterEvidence.length > 0` 또는 파이프라인에 `conflict` 셀이 있다 → `risk`
3. `status === "verified"` → `verified`
4. 그 외 → `review`

게이트 통과 수는 임계값 상수(`FAITHFULNESS_THRESHOLD` 등)를 그대로 쓴다. `gates.source` 는 `sourceCoverage ≥ 0.5` 인 기업 수, `faithfulness` 는 그중 `faithfulness ≥ 0.85`, `evidence` 는 그중 `evidenceMatch ≥ 0.4` — **누적 퍼널**이다. `gateDropouts` 는 각 단계 차이.

정렬(`sortForTriage`): `risk → review → verified → pending`, 같은 판정 안에서는 faithfulness 오름차순, 없으면 이름순.

**테스트**: 규칙 4개 각각 / risk 가 verified 보다 우선 / 누적 퍼널이 단조감소 / 정렬 순서.

### C-2. `src/lib/repositories/verificationResult.ts` 에 추가

```ts
export async function listLatestVerifications(year: number): Promise<VerificationRow[]>
```

기업당 최신 **완료**(`status === "completed"`) 실행 하나의 검증 결과. `mentionArticles.ts` 의 "기업당 최신 하나" 패턴을 따른다. `counterEvidence` JSON 은 여기서 파싱해 배열 길이로 넘긴다.

**테스트**: `test-support/db.ts` 로 실행 2건을 넣고 최신 완료분만 오는지 / 검증 없는 실행은 제외.

### C-3. `src/components/dashboard/verdict-pill.tsx`

```tsx
<VerdictPill verdict="risk" />   // → 아이콘 + "리스크"
```

- 라벨: `verified` 통과 · `review` 검토 · `risk` 리스크 · `pending` 미분석
- 아이콘은 인라인 SVG 4종(체크·시계·삼각 경고·점선 원). **텍스트와 아이콘이 필수, 색은 보조** — 색각 이상과 흑백 인쇄에서도 갈려야 한다
- 색은 A 의 `*-surface`(배경) + `*`(텍스트)
- `aria-label` 없음 — 텍스트가 곧 라벨

**테스트**: 4종 라벨 / 각 판정에 svg 1개 / 색 클래스.

## D. `/dashboard` 재구성 — `src/app/dashboard/page.tsx`

### 데이터

| 이미 있음 | 추가 |
|---|---|
| `listCompanies` · `listCompanyPipeline` · `summariseSourceCoverage` · `getDashboardSummary`(movers 만) · `listMentionArticles`+`buildCoMentions` | `listLatestVerifications` → `rollupVerdicts` / `buildNewsCoverage`(아래) / `buildActionItems`(아래) |

제거: `listGeocodes` · `listCompanyAddresses` · `buildRegionView` · `buildPins` · `koreaGazetteer` · `NaverMap` · `RegionGrid` · `CloudBoard` · `GrowthRanking` 임포트와 그 계산. 컴포넌트·서비스 파일은 삭제하지 않는다.

### 섹션 순서 (목업 01~06)

**헤더** — 킥커 `{year}년 평가 · ICT기금사업 우수기업`, 제목 `선정 근거 준비 현황`, 요약 한 문장 `50개사 중 31개사가 검증을 통과했고, 5개사는 오늘 손이 가야 합니다.` (5 = risk + 사업자번호 미확보 중복 제거). 오른쪽에 연금 스냅샷·마지막 분석 시각 2칸과 `미분석 n개사 실행` 링크 — `/companies?year=…&verdict=pending` 으로 가는 `Link`, 버튼이 아니다.

**01 판정 현황** — `VerdictBoard`: 4색 비율 막대(2px 간격, pending 은 hatch) + 4칸(색 세로선 3px·건수·비율·설명 한 줄). 설명은 고정 문구:
- 통과: `근거 인용 평균 {n}건`
- 검토: `근거충실도 0.5~0.85 · 사람이 봐야 한다`
- 리스크: `반증 발견 또는 원천 충돌`
- 미분석: `뉴스 수집 전 · 분석을 돌리지 않았다`

**02 검증 게이트 통과율** — `GateFunnel`: 3줄 가로 막대(primary fill, 트랙 `#eef0f2`) + 오른쪽 `n/분석수` + 하단 게이트별 탈락 수와 고정 사유(`기사 링크 없음` / `기사 원문에 없는 수치` / `공식 원천과 불일치`).

**03 원천 커버리지** — `SourceCoverageBars`: 7줄, 막대 트랙이 hatch(결측 문법), `found/total`. 전수 확인은 verified 색, 나머지는 `--cloud-2`(`#1655a8`) 대신 **primary** 를 쓴다 — 새 색을 들이지 않는다. 각주 한 줄: `재무제표는 비상장·비외감이라 구조적 결측 — 나라장터 낙찰·연금 인건비가 대리지표다.` 기존 `SourceCoverageStrip` 은 기업 상세 등에서 쓸 수 있게 남긴다.

**04 기업별 근거 매트릭스** — `CompanyPipelineGrid` 개편:
- 열: 판정(`VerdictPill`) · 기업 · 사업자번호 · 국세청 · 연금 · 조달 · 벤처 · DART · 재무 · 충실도 · 인용 · 최근 보도. `MATRIX_STAGES` 에서 `news`·`fsc`·`llm`·`verify` 열은 뺀다 — 뉴스는 최근 보도 열이, 금융위는 사업자번호 열이, 분석·검증은 판정 열이 대신한다
- 사업자번호 없음 → `미확보 · 대조 불가`(review 텍스트색). 빈칸이 아니라 경고다
- 행 왼쪽 3px 세로선: risk·review 만. 배경 칠 없음
- 기본 정렬 `sortForTriage`. 세그먼트 컨트롤로 `봐야 할 순서 / 기업명 / 검증 점수 / 최근 보도` — 클라이언트 상태, URL 미반영
- 푸터: 상태 범례 4종 + `사업자번호 미확보는 뉴스 외 근거를 붙일 수 없다` + 페이지네이션(10행)
- 최근 보도일이 30일 초과면 risk 텍스트색

**05 조치 필요** — `ActionList`, 데이터는 `buildActionItems`:

| 항목 | 조건 | 처방 문구 |
|---|---|---|
| 사업자번호 미확보 | `businessNo` 없음 | `금융위 폴백도 실패 — 수기 입력 필요` |
| 동명 타사 충돌 | 파이프라인 conflict 셀 | `{stage} 가 다른 기업을 물어옴 — 두 원천 교차 일치로 확정` |
| 30일 이상 보도 없음 | 최신 기사 30일 초과 또는 없음 | `뉴스 근거가 낡았다 — 재수집 후 재분석` |
| 12개월 인원 20% 이상 감소 | `movers.declining` 중 `ratio ≤ -0.2` | `국민연금 실측 — 본사 이전 여부를 상세에서 확인` |

각 항목: 아이콘+제목 · 건수 · 기업 칩(최대 4 + `외 n`) · 처방. 칩은 기업 상세 링크. 0건 항목은 **표시하되** 건수 0 과 `없음` 으로 — 항목이 사라지면 점검했는지 알 수 없다.

**06 최근 기사** — `RecentArticles` 개편: 4열 그리드(날짜 48px · 출처 76px · 제목 1fr ellipsis · 기업 칩), 그룹 헤더 `이번 주 / 지난 주 / 그 이전`. 제목 줄 오른쪽에 `최근 14일 n건 · 전체 n건`. 푸터 링크 `기업별 보도 현황 보기 →` 는 **이번 범위에서 뺀다** — 갈 곳이 없다. `emptyLabel` prop 추가.

### 레이아웃

`flex-col gap-9`. 02+03 은 `lg:grid-cols-2 items-stretch`, 05+06 은 `lg:grid-cols-[372px_minmax(0,1fr)] items-start`. `lg` 미만은 세로 스택. 카드 높이 고정(`h-[26rem]`)은 06 에만 남기고 나머지는 내용 높이.

### 새 서비스

- `src/lib/services/newsCoverage.ts` — `buildNewsCoverage(companies, graph.articles)` → 기업별 `{ articles, latest }` + 14일/전체 건수. `graph.nodes` 엔 최신 보도일이 없어 기사에서 뽑는다
- `src/lib/services/actionItems.ts` — `buildActionItems({ companies, pipeline, coverage, movers })` → 위 4항목. 순수 함수, DB 접근 없음

### 테스트

- 서비스: `verdictRollup` · `newsCoverage` · `actionItems` 각각 순수 함수 테스트
- 컴포넌트: `verdict-board` · `gate-funnel` · `source-coverage-bars` · `action-list` 신규, `company-pipeline-grid` · `recent-articles` 기존 테스트 갱신(정렬·경고 문구·그룹 헤더)
- `page.tsx` 는 서버 컴포넌트라 테스트 없음. `npm test` + `npm run build` + 개발 서버에서 `/dashboard` 육안 확인

## 하지 않는 것

- 대시보드에서 분석 실행 트리거 (링크로 기업 목록에 보낸다)
- 판정 필터를 URL 에 싣기 (Prisma 쿼리 6개를 칩 클릭마다 재실행할 이유가 없다)
- 워드클라우드·지도·증감 랭킹 컴포넌트 삭제
- 다크 모드 시각 검토 (토큰만 채운다)
- E: 직전 실행 대비 증감 — `analysisRun` 이력에서 이전 스냅샷 판정을 재계산해야 하고 저장 구조가 없다

## 리스크

- **risk 판정의 오탐**: `counterEvidence` 는 judge 가 내는 것이라 1건만 있어도 리스크가 된다. 첫 실행 결과를 보고 임계(예: 2건 이상)를 정한다 — 상수로 빼둔다
- **매트릭스 열 12개**: `min-w-[1180px]` 가로 스크롤 유지. `fsc`·`llm`·`verify` 열을 빼서 4열 줄었다
- **조치 필요 "5개사" 요약 수**: risk 와 사업자번호 미확보의 합집합. 정의를 헤더 `title` 속성에 적는다
