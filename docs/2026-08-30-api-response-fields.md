# 외부 API 응답 필드 — 받는 것 · 쓰는 것 · 안 쓰는 것

2026-08-30 코드 실측(`src/lib/services/*.ts` 파서 기준). "활용" 열은 프로덕션 화면·판정·랭킹 어디에서 실제로 읽히는지, "미활용" 은 파싱은 하지만(또는 원본 응답에 있지만) 아직 어디에도 쓰이지 않는 필드다. 원본 응답은 `SourceSnapshot.payload` 에 JSON 그대로 저장되므로 미활용 필드도 재조회 없이 꺼내 쓸 수 있다.

범례 — 활용처 약어: **요약**=원천 카드/스트립 요약문(`sourceEvidence.ts`) · **매트릭스**=홈 근거 매트릭스 셀 · **사건**=사건 추출(`eventRules.ts`) · **랭킹**=벤치마킹 지표(`benchmarkInputs.ts`) · **기여도**=기업 상세 근거 요약(`explainer.ts`) · **고용**=고용 규모 12개월(`dashboardSummary.ts`) · **식별**=사업자번호 확보/동명 대조(`collectEvidence.ts`)

## 요약 — API 별 활용 / 미활용 컬럼

| API | 활용 컬럼 | 미활용 컬럼 |
|---|---|---|
| **OpenDART 기업개황** `company.json` | `corp_name`(요약·상호 대조) · `bizr_no`(사업자번호 확보·대조) | `jurir_no` · `ceo_nm` · `induty_code`(파싱만, 단건 조회 시 코드가 업종에 잘못 들어감) · `adres` · `hm_url` · `phn_no` · `est_dt` · `acc_mt`(파싱 안 함) |
| **OpenDART 고유번호** `corpCode.xml` | `corp_code` · `corp_name`(상호→코드 매핑) | `stock_code`(상장 여부) · `modify_date` |
| **OpenDART 재무** `fnlttSinglAcnt.json` | `매출액`(랭킹·기여도·요약) · `영업이익` · `당기순이익`(기여도) · `bsns_year` | `자산총계`(파싱만) · `frmtrm_amount`/`bfefrmtrm_amount` 전기값 · `부채총계` · `자본총계`(파싱 안 함) |
| **국세청 휴폐업** `status` | `b_stt_cd`(휴·폐업 사건·매트릭스) · `b_stt` · `tax_type`(요약) · `end_dt`(요약 문구에만 — 사건 날짜로는 미사용) | `utcc_yn` · `tax_type_change_dt` · `invoice_apply_dt` · `rbf_tax_type` |
| **나라장터 조달업체** `getPrcrmntCorpBasicInfo02` | `emplyeNum`(요약 문구에만) · 조회 성공 여부(매트릭스 "조달 등록") | `corpNm` · `ceoNm` · `adrs` · `telNo` · `hmpgAdrs` · `opbizDt` · `corpBsnsDivNm` · `mnfctDivNm`(전부 파싱만) |
| **나라장터 낙찰·계약** | 없음(개통만, 프로덕션 미연결) | 전체(`bidwinnrBizno` `bidwinnrNm` 낙찰금액·계약금액 등 — 실험 스크립트만) |
| **벤처확인 명단** `odcloud 15084581` | `벤처확인유형`(요약) · `벤처유효종료일`(요약·만료 사건) · 기업명(매칭) | `벤처유효시작일` · `업종명(11차)`(파싱만) · 소재지 · 대표자(파싱 안 함) |
| **국민연금 가입 사업장** `NpsBplcInfoInqireServiceV2` | `jnngpCnt`(고용 추이·사건·목록·요약) · `bzowrRgstNo` 앞 6자리(동명 대조·법인 합산) · `wkplNm` · `wkplRoadNmDtlAddr`(후보 점수·지오코딩) · `wkplJnngStcd`(후보 점수) · `dataCrtYm` · `seq`(조회 키) | `vldtVlKrnNm` · `wkplIntpCd`(업종) · `adptDt` · `scsnDt`(등록·탈퇴일) · `crrmmNtcAmt`(고지금액→기준소득·인건비) · `nwAcqzrCnt` · `lssJnngpCnt`(입·퇴사) — 전부 파싱만 |
| **금융위 기업기본정보** `getCorpOutline_V2` | `corpNm`(매칭) · `bzno`(번호 없을 때만 확보; 번호를 알면 호출 자체 생략) | `crno` · `enpEstbDt` · `enpEmpeCnt` · `enpMainBizNm` · `enpBsadr` · `smenpYn`(전부 파싱만) |
| **네이버 뉴스 / 구글 RSS** | `title` · `link`/`originallink` · `description` · 원문 본문 · `pubDate` · 언론사(도메인) — 전부 활용 | 없음(네이버 `similarity`·구글 `guid` 등은 애초에 안 받음) |
| **Anthropic Messages** | `sentiment_score`·`sentiment_label`·`news_trend_summary` · `is_award_related`·`award_name` · `is_investment_related`·`investment_name` · 종합의견 · judge `claims[]`·`counter_evidence[]` | `award_reason` · `investment_reason`(엑셀에만) · `usage` 토큰(저장만, 화면 없음) |
| **네이버 지오코딩** | `x` · `y` · `roadAddress`(저장) | 저장은 되지만 지도가 현재 화면에서 빠져 화면 활용 0 · `addressElements` · `jibunAddress`(파싱 안 함) |
| **SGIS 행정구역** | `adm_cd` · `adm_nm`(스크립트로 이름표 생성) | 화면 미사용(지역 그리드 제거됨) |
| **Tavily** | 없음 | 전체(키만 보유) |

활용률이 낮은 원천은 조달업체(1/9) · 금융위(2/8) · 국민연금(6/13) · DART 기업개황(2/10) 이고, 뉴스와 LLM 응답은 거의 다 쓴다. 아래 절은 각 컬럼의 활용처와 미활용 컬럼을 어디에 쓸 수 있는지의 상세다.

## 1. OpenDART 기업개황 `company.json` (`dart.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `corp_name` | `corpName` | 요약 · 식별(상호 정확 일치 판정) | |
| `bizr_no` | `businessNo` | **식별** — 등록 명단에 번호가 없을 때 1순위 확보 경로 | 2025년 50개사는 명단에서 왔으므로 실제로는 검증용 |
| `jurir_no` | `corporateNo` | 미활용 | 법인등록번호 — 동명 대조 2차 키로 쓸 수 있다 |
| `ceo_nm` | `ceoName` | 미활용 | 동명 충돌 후보 카드에 표시 예정(시안) |
| `induty_code` | `industryCode` | 미활용 | 기업 상세의 단건 원천 조회(`/api/companies/[id]/dart`)는 `Company.industry` 가 비어 있으면 이 **코드**를 그대로 넣는다 — 올림플래닛 업종이 `58222` 인 원인. 일괄 실행(`/api/analyze/batch`)은 넣지 않는다. 표준산업분류 코드→이름 표가 있어야 쓸 수 있으므로 단건 경로도 빼는 게 맞다 |
| `stock_code`(corpCode.xml) | `CorpCandidate.stockCode` | 미활용 | 상장 여부 — 재무 결측이 "비외감" 인지 판별할 때 근거가 된다 |
| `adres` `hm_url` `phn_no` `est_dt` `acc_mt` | 파싱 안 함 | — | 주소·홈페이지·전화·설립일·결산월. **설립일**은 이력·시상(Task 14 "신규 최고 점수")에, **주소**는 동명 대조·지도에 쓸 수 있다 |

## 2. OpenDART 재무 `fnlttSinglAcnt.json` (`dart.ts`)

| 원본 계정명 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `매출액` | `revenue` | **랭킹**(재무 지표) · 기여도 · 요약 | 50개사 중 3개사만 있음(외감) |
| `영업이익` | `operatingIncome` | 기여도 | |
| `당기순이익` | `netIncome` | 기여도 | |
| `자산총계` | `totalAssets` | 미활용 | 기업 규모 정규화 분모 후보 |
| `bsns_year` | `fiscalYear` | 기여도 | |
| 전기·전전기 값(`frmtrm_amount` `bfefrmtrm_amount`) | 파싱 안 함 | — | **전년 대비 성장률**을 낼 수 있는데 버리고 있다 — Task 14 "전년 대비 최다 성장" 에 필요 |
| 부채총계·자본총계 | 파싱 안 함 | — | 리스크 신호(자본잠식) 후보 |

## 3. 국세청 휴폐업 `nts-businessman/v1/status` (`nts.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `b_stt_cd` | `statusCode` · `isActive` | 요약 · 매트릭스 · **사건**(휴·폐업 경보) | `01` 계속사업자 |
| `b_stt` | `status` | 요약 | |
| `tax_type` | `taxType` | 요약("부가가치세 일반과세자") | 면세·간이 여부 — 규모 추정 보조 |
| `end_dt` | `closedAt` | 요약("폐업 · 20260731") | 사건 발생일로 쓰지 않고 조회일을 쓴다 — **폐업일을 사건 날짜로 써야 정확**하다 |
| `utcc_yn` `tax_type_change_dt` `invoice_apply_dt` `rbf_tax_type` | 파싱 안 함 | — | 단위과세·과세유형 전환일 — 쓸 곳 없음 |

## 4. 나라장터 조달업체 `getPrcrmntCorpBasicInfo02` (`narajangteo.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `emplyeNum` | `employeeCount` | 요약("종업원 39") | **랭킹·고용에 미활용** — 국민연금 가입자와 교차 검증할 수 있다 |
| `corpNm` `ceoNm` | `corpName` `ceoName` | 미활용 | 동명 후보 카드용 |
| `adrs` `telNo` `hmpgAdrs` | `address` `phone` `homepage` | 미활용 | 주소는 지도·동명 대조 |
| `opbizDt` | `openedAt` | 미활용 | **개업일** — 업력 지표 후보 |
| `corpBsnsDivNm` | `businessDivision` | 미활용 | 물품/용역/공사 구분 — "공공조달 참여" 사건·랭킹 보조 |
| `mnfctDivNm` | `manufacturingDivision` | 미활용 | 제조/비제조 — 루브릭(제조) 자동 매핑 근거로 쓸 수 있다 |
| 낙찰·계약 API(`ScsbidInfoService` `CntrctInfoService`) | 미구현(개통만) | — | 공공조달 매출 — 재무 결측 보완 대리지표, `collect-financial-signals.ts` 에서만 실험 |

## 5. 벤처확인 명단 `odcloud 15084581` (`ventureCertification.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `벤처확인유형` | `type` | 요약("혁신성장유형") | |
| `벤처유효종료일` | `validUntil` | 요약 · **사건**(만료 임박/만료) | |
| `벤처유효시작일` | `validFrom` | 미활용 | |
| `업종명(11차)` | `industry` | 미활용 | `Company.industry` 가 비었을 때 채울 수 있는 **이름 형태 업종** — DART 코드보다 낫다 |
| 기업명·소재지·대표자 | 이름만 매칭에 사용 | — | |

## 6. 국민연금 가입 사업장 `NpsBplcInfoInqireServiceV2` (`nps.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `jnngpCnt` | `subscribers` (월별) | **고용**(12개월 추이) · 요약 · **사건**(인원 증감) · 기업 목록 | 사업장 단위 합산 |
| `bzowrRgstNo`(앞 6자리) | `businessNoPrefix` | **식별**(동명 대조·법인 합산 키) · 요약 | 10자리는 안 준다 |
| `wkplNm` `wkplRoadNmDtlAddr` | `companyName` `address` | 식별(후보 점수) · 지도(지오코딩 입력) | |
| `wkplJnngStcd` | `isSubscribed` | 식별 점수 | |
| `vldtVlKrnNm` `wkplIntpCd` | `industry` `industryCode` | 미활용 | 업종명 — `Company.industry` 보완 후보 |
| `adptDt` `scsnDt` | `registeredAt` `withdrawnAt` | 미활용 | 사업장 등록일·탈퇴일 — **탈퇴일은 사실상 폐업 신호**, 사건 후보 |
| `crrmmNtcAmt` | `noticeAmount` → `averageBaseIncome` `annualPayroll` | 미활용 | 당월 고지금액 → 인당 기준소득·연 인건비 추정. 랭킹 재무 결측 보완 대리지표 |
| `nwAcqzrCnt` `lssJnngpCnt` | `hired` `departed` | 미활용 | 월 입·퇴사 — 이직률 사건 후보 |
| 후보 목록 | `candidates[]` | 요약(충돌 건수) | 후보 선택 UI 없음 → 시안의 "확인 필요" 항목 |

## 7. 금융위 기업기본정보 `getCorpOutline_V2` (`fscCorpOutline.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `bzno` | `businessNo` | 식별(DART 도 명단도 없을 때 2순위) | **사업자번호를 이미 알면 호출 자체를 건너뛴다** — 그래서 51개사가 "미조회". 교차 검증용으로 항상 호출할지 결정 필요 |
| `crno` | `corporateNo` | 미활용 | |
| `enpEstbDt` | `establishedAt` | 미활용 | 설립일 |
| `enpEmpeCnt` | `employeeCount` | 미활용 | 종업원수 — 3원천 교차(연금·조달·금융위) 가능 |
| `enpMainBizNm` `enpBsadr` | `mainBusiness` `address` | 미활용 | |
| `smenpYn` | `isSmallBusiness` | 미활용 | 중소기업 여부 |

## 8. 뉴스 — 네이버 API HUB `search/v1/news` · 구글 뉴스 RSS (`newsCollector.ts`, `articleBody.ts`)

| 원본 키 | 파싱 필드 | 활용 | 비고 |
|---|---|---|---|
| `title` `link`/`originallink` | `title` `link` | 분석 입력 · 사건 근거 링크 · 검증 층① 출처 검사 · 기여도 헤드라인 | |
| `description` | `description` | 분석 입력(본문 없을 때) | |
| 본문(원문 크롤링) | `content` | 분석 · 검증 층③ 근거일치 · **인용 팝오버** | |
| `pubDate` | `published` | 사건 발생일 · 최근 보도일 · 무보도 판정 | |
| 언론사(도메인→`pressMapping.json`) | `source` | 표시 | |
| — | `titleMatch` `mentions` `relevance` | 분석 대상 선별(primary 만 LLM 에) | 자체 산출 |

## 9. Anthropic Messages (`analyzer.ts` · `verification.ts`)

| 응답 | 파싱 필드 | 활용 |
|---|---|---|
| 동향 `sentiment_score` `sentiment_label` `news_trend_summary` | `trend` | **랭킹**(감성 평균) · 사건(긍정/부정 보도) · 기여도 헤드라인 |
| 수상 `is_award_related` `award_name` | `award` · `stats.awardCount` | **랭킹**(수상) · 사건 |
| 투자 `is_investment_related` `investment_name` | `investment` · `stats.investmentCount` | **랭킹**(투자) · 사건 |
| 종합의견 | `comprehensiveOpinion` | 기업 상세 · 인용 팝오버 · 엑셀 |
| judge `claims[]{claim,supported,evidence}` `counter_evidence[]` | 층② 충실도 · 반증 | 판정 · 검증 패널 |
| `usage` 토큰 | `usageJson` | 저장만 — 리포트·실행 이력 화면(§4-B) 미구현 |

## 10. 그 밖에

| API | 받는 것 | 활용 |
|---|---|---|
| 네이버 지오코딩 | `x` `y` `roadAddress` | `CompanyGeocode` 저장 → 지도(`naver-map.tsx`). **홈 리디자인 후 지도가 화면에서 빠져 현재 어디에도 안 보인다** |
| SGIS 행정구역 | `adm_cd` `adm_nm` | `scripts/fetch-regions.ts` → 지역 그리드(현재 화면 미사용) |
| DART 고유번호 `corpCode.xml` | `corp_code` `corp_name` `stock_code` `modify_date` | 상호→corpCode 매핑(24h 캐시) |
| Tavily | — | 키만 있음, 미사용(Task 15) |

## 반영 현황 (2026-08-31)

1순위 여섯 줄과 2순위의 상장 여부·재무 전년비를 기업 상세에 반영했다 — 헤더 기본 줄(대표·설립·주소·법인번호·상장, 원천 일치 여부) · 종업원수 3원천 비교(20% 이상 차이는 "원천 간 차이 큼") · 인건비 추정·12개월 입퇴사 · 원천 스트립 상세 펼침 · DART 재무 줄(전년비·자산총계). 조립은 `src/lib/services/companyFacts.ts`, 파서 확장은 `dart.ts`(`frmtrm_amount` · `stockCode`). 기존 스냅샷은 재조회해야 전년비·상장이 채워진다. 국민연금 탈퇴일 사건·국세청 폐업일·금융위 항상 호출·업종명 보완은 남아 있다.

## 바로 쓸 수 있는 미활용 데이터 — 우선순위

1. **국민연금 `scsnDt`(탈퇴일) · `lssJnngpCnt`(퇴사)** → 폐업·급감 사건의 조기 신호. 지금은 가입자 수 20% 변동만 본다.
2. **재무 전기 값**(`frmtrm_amount`) → 성장률. Task 14 시상 카테고리에 필수인데 파서가 당기만 읽는다.
3. **종업원수 3원천 교차**(연금 `jnngpCnt` · 조달 `emplyeNum` · 금융위 `enpEmpeCnt`) → 동명 충돌 판정 근거이자 인원 결측 보완.
4. **업종명**(벤처 `업종명(11차)` · 연금 `vldtVlKrnNm`) → `Company.industry` 결측 5건과 코드값 오염(`58222`) 정리, 랭킹 루브릭 자동 매핑.
5. **국세청 `end_dt`** 를 휴·폐업 사건의 발생일로 — 지금은 조회일이 들어가 30일 창에서 오래된 폐업이 "새 사건" 으로 보인다.
6. **금융위 항상 호출** — 사업자번호 교차 검증(등록 명단 오타 방지).
