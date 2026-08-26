# P0: AI 분석 신뢰성 검증 + DART/국세청 데이터 연동 구현계획

**작성일:** 2026-08-26 (현행화: 추가 기능 4건 포함 — 리스크 모니터링, 비교 벤치마킹, XAI 리포트, 연도별 이력 트래킹)
**목표:** AI 기업 분석 결과의 환각(hallucination)을 자동 검증하고, DART(재무)·국세청(휴폐업) 공식 데이터를 연동해 우수기업 선정 근거의 신뢰성·객관성을 강화하며, 리스크 모니터링·기업 간 비교·설명가능한 근거·연도별 성과 트래킹으로 우수기업 선정·관리 체계를 완성한다.

**대응 요구사항 (과제계획서 기준):**
- [리스크] AI 환각으로 부정확한 데이터 도출 방지 → 검증 상시화
- [Plan] 캡관정보·신뢰성 강화 → 공식 출처 데이터 병기, 모니터링 체계 구축
- [Do] 평가위원회 제공 AI 다차원 분석자료(뉴스·공공·금융) 구현
- [Do] 정기평가회 AI 분석자료 제공, 연도별 시상·성과 관리

---

## 전제 조건 및 제약

- 기존 스택 유지: Python 3.12 / Flask 3.0.3 / Flask-SQLAlchemy / OpenAI SDK (gpt-4o-mini)
- 신규 의존성: OpenDartReader (DART 연동), python-dotenv, pytest (시각화는 Chart.js CDN 사용, 신규 파이썬 의존성 없음)
- 모든 외부 API 키는 환경변수만 사용 (`DART_API_KEY`, `NTS_SERVICE_KEY`, `OPENAI_API_KEY` 등). 소스코드 내 평문 키 금지
- 외부 API 테스트는 전부 mock으로 수행 (네트워크 의존 테스트 금지)
- 기존 `routes.py`(4,600줄) 대규모 리팩토링 지양 — 신규 로직은 `app/services/` 모듈로 분리, 라우트는 얇게 호출
- DB는 SQLite 유지, 마이그레이션은 기존 `db.create_all()` 관례 준수

## 아키텍처 개요

기존 분석 파이프라인(뉴스 수집 → GPT 분석 → 엑셀 리포트)에 서비스를 추가:

```
[국세청 API] ──→ nts_service ──→ 적격성 선검증 ─┐
[DART API]  ──→ dart_service ─→ 재무 차원 데이터 ├─→ 다차원 검증 시트 (엑셀)
[GPT 분석결과] → verification ─→ 환각 검증 결과 ─┘        │
                                              └─→ VerificationResult (DB 저장)

[DART 공시·뉴스] → risk_monitor ─→ 리스크 알림 (RiskAlert DB)
[기업 50개사]    → benchmarking → 비교 랭킹 (점수 산출)
[기존 분석결과]  → scoring      → 기여도 분해 → XAI 리포트
[Company 이력]  → history       → 연도별 트래킹·시상 카테고리
```

- **nts_service**: 국세청 사업자등록 상태조회 OpenAPI로 계속사업자 여부 확인
- **dart_service**: OpenDART API로 매출액·영업이익·당기순이익·자산총계 추출
- **verification**: 출처 인용(URL) 검사 + LLM-as-judge 근거충실도 채점 → "verified / needs_review" 판정
- **risk_monitor**: 분석 대상 기업의 처벌·제재·소송·분쟁성 뉴스/DART 공시 감지 → RiskAlert 기록·알림
- **benchmarking**: 후보 기업 전체를 동일 지표로 정규화해 상대 랭킹 산출
- **scoring**: 지표별 기여도를 분해해 "왜 이 점수인가" 설명 자료 생성 (XAI)
- **history**: 연도별 선정이력·점수 변화 축적 → 성장 기업·연속 선정 기업 자동 산출
- 검증 기준: faithfulness ≥ 0.85 AND 출처커버리지 ≥ 0.5 → verified, 미달 시 "검토 필요" 플래그

## Task 목록 (TDD: 각 태스크는 실패 테스트 → 구현 → 통과 → 커밋 사이클)

### Phase A: 신뢰성 기반 (기존 계획)

#### Task 1: 환경변수화 및 설정 인프라
- **파일**: 신규 `app/config.py`, `.env.example`, `tests/` 기본 구조 / 수정 `app/news_service.py`, `app/email_service.py`, `.gitignore`, `requirements.txt`
- **내용**:
  - Config 클래스가 환경변수(DART/NTS/NAVER/GMAIL 키)를 읽도록 구현
  - news_service에 하드코딩된 네이버 Client ID/Secret, email_service의 Gmail 계정·앱비밀번호를 환경변수로 교체 (보안 조치)
  - pytest, python-dotenv 설치 및 테스트 기반(conftest) 구축
- **검증**: pytest 실행 시 config 테스트 통과, 기존 앱이 정상 기동됨
- **커밋**: `feat: add config module and move hardcoded keys to env vars`

#### Task 2: 국세청 사업자등록 상태조회 서비스
- **파일**: 신규 `app/services/nts_service.py`, `tests/test_nts_service.py`
- **내용**:
  - `check_business_status(사업자번호)` 함수: 국세청 OpenAPI 호출 → 계속/휴업/폐업 상태, 과세유형, 폐업일자 반환
  - 반환 구조: 사업자번호, 상태코드, `is_active` (계속사업자 여부), 에러 필드
  - 입력 검증(10자리 숫자), API 키 미설정·호출 실패 시 에러 필드로 안전하게 처리
  - 테스트 케이스: 계속사업자 / 폐업자 / 미등록번호 / API 오류 (4케이스, 전부 mock)
- **검증**: 4개 테스트 통과
- **커밋**: `feat: add NTS business status check service`

#### Task 3: 국세청 검증 API 엔드포인트
- **파일**: 수정 `app/routes.py` / 신규 `tests/test_nts_api.py`
- **내용**:
  - `GET /api/company/business-status?b_no=` 라우트 추가 (로그인 필수, 기존 login_required 데코레이터 재사용)
  - 파라미터 검증, 서비스 호출 결과를 JSON으로 반환
  - 테스트: 미로그인 리다이렉트 / 정상 조회 / 잘못된 파라미터
- **검증**: 3개 테스트 통과
- **커밋**: `feat: add business status verification API endpoint`

#### Task 4: DART 재무정보 서비스
- **파일**: 신규 `app/services/dart_service.py`, `tests/test_dart_service.py` / 수정 `requirements.txt`
- **내용**:
  - OpenDartReader 설치 및 래퍼 구현
  - `get_financial_summary(기업명, 연도)` 함수: 기업 검색 → 재무제표 추출 → 매출액/영업이익/당기순이익/자산총계 반환
  - 라벨 별칭 매핑 (재무제표 표기 다양성 대응), 기업 미발견·보고서 부재·API 오류 처리
  - 테스트 케이스: 정상 조회 / 기업 없음 / API 키 없음 (전부 mock)
- **검증**: 3개 테스트 통과
- **커밋**: `feat: add DART financial summary service`

#### Task 5: DART 재무정보 API 엔드포인트
- **파일**: 수정 `app/routes.py` / 신규 `tests/test_dart_api.py`
- **내용**:
  - `GET /api/company/financial?corp_name=&year=` 라우트 추가 (로그인 필수)
  - 테스트: 미로그인 / 정상 조회 / 파라미터 누락
- **검증**: 3개 테스트 통과
- **커밋**: `feat: add DART financial info API endpoint`

#### Task 6: 환각 검증기 (출처 인용 검사 + LLM-as-judge)
- **파일**: 신규 `app/services/verification.py`, `tests/test_verification.py`
- **내용**:
  - `check_citations(분석결과)`: 뉴스 항목별 출처·링크 존재 및 URL 형식 검사, 출처커버리지 계산
  - `verify_analysis(기업명, 분석결과, 원문목록)`: gpt-4o-mini를 심사관(judge)으로 사용해 분석결과가 뉴스 원문에 근거하는지 문장 단위 검증 → 근거충실도 점수 + 미확인 주장 목록 반환
  - 판정 로직: 근거충실도 ≥ 0.85 AND 출처커버리지 ≥ 0.5 → "verified", 아니면 "needs_review"
  - judge 응답 JSON 파싱 실패·OpenAI 오류 시에도 "needs_review"로 안전하게 판정 (검증 실패 = 신뢰 불가 원칙)
  - 테스트 케이스: 인용 전부 있음 / 인용 누락 / verified 판정 / needs_review 판정 / judge 오류 (5케이스)
- **검증**: 5개 테스트 통과
- **커밋**: `feat: add hallucination verification service with LLM-as-judge`

#### Task 7: VerificationResult 모델 및 분석 파이프라인 통합
- **파일**: 수정 `app/models.py`, `app/routes.py` / 신규 `tests/test_verification_model.py`, `tests/test_pipeline_integration.py`
- **내용**:
  - `verification_results` 테이블 추가: 기업명, 분석유형, 검증상태, 근거충실도, 출처커버리지, 미확인주장, 전체결과 JSON, 생성시각
  - 저장/최신조회 헬퍼 함수 추가
  - `api_analyze_streaming`의 분석 완료 지점에서 검증을 자동 실행하고, SSE로 검증 진행 이벤트(상태·점수)를 프론트엔드에 전송
  - 검증 실패가 스트리밍 전체를 중단시키지 않도록 방어 처리
  - 구현 시 `routes.py:977~1145`의 실제 변수명을 확인 후 연결
- **검증**: 모델 저장/조회 테스트, 파이프라인 통합 테스트, 전체 회귀 통과
- **커밋**: `feat: integrate verification into analysis pipeline with DB persistence`

#### Task 8: 엑셀 리포트에 다차원 데이터·검증상태 반영
- **파일**: 수정 `app/routes.py` (`create_excel_file`, 분석 파이프라인 호출부), `app/models.py` (Company에 사업자번호 컬럼) / 신규 `tests/test_excel_report.py`, `migrate_add_business_no.py`
- **내용**:
  - `create_excel_file`에 키워드 인자 3개(재무/사업자상태/검증) 추가 — 기본값 None이므로 기존 호출부 무수정
  - 엑셀에 "다차원 검증" 시트 신설: 재무요약(DART) / 적격성(국세청) / AI검증(상태·점수·미확인주장)
  - Company 모델에 `business_no` 컬럼 추가 + 기존 DB용 1회 ALTER 마이그레이션 스크립트 + 기업관리 화면에 사업자번호 입력 필드 추가
  - 분석 완료 시 DART·국세청 데이터를 자동 조회해 리포트에 반영
  - 구현 시 `routes.py:1520~2065` 기존 엑셀 코드의 관례(변수명, 스타일 헬퍼)를 따름
- **검증**: 시트 포함 테스트 / 옵션 데이터 없이도 동작 테스트 / 전체 회귀 통과
- **커밋**: `feat: add multi-dimensional verification sheet to excel report`

### Phase B: 선정·관리 체계 고도화 (신규 추가)

#### Task 9: 기업 리스크 모니터링 (RiskAlert)
- **파일**: 신규 `app/services/risk_monitor.py`, `tests/test_risk_monitor.py` / 수정 `app/models.py`, `app/routes.py`
- **내용**:
  - `risk_keywords` 사전 정의: 처벌/제재/소송/기소/압수수색/배임/횡령/리콜/환수/분쟁 등 카테고리별 키워드 그룹
  - `scan_risk_signals(기업명, 뉴스목록)`: 기존 news_service가 수집한 뉴스 제목·본문에서 리스크 키워드 매칭 → 카테고리·심각도(뉴스 개수 기반) 산출
  - `RiskAlert` 모델 추가: 기업명, 카테고리, 감지 키워드, 뉴스 링크, 심각도, 확인여부(담당자 검토 플래그), 생성시각
  - 분석 파이프라인 완료 시 자동 스캔 → 리스크 감지 시 SSE 알림 이벤트 + 엑셀 리포트 "리스크" 시트에 반영
  - `GET /api/company/risk-alerts` 라우트: 미확인 알림 목록 조회, `POST` 담당자 확인 처리
  - DART 주요사항보고서(공정거래 관련 등) 확장은 후속 과제로 명시 (YAGNI — 본 태스크는 뉴스 기반만)
- **검증**: 키워드 매칭/미매칭/심각도 산출/알림 API 테스트 통과
- **커밋**: `feat: add risk signal monitoring with alerts`

#### Task 10: 기업 간 비교·벤치마킹 랭킹
- **파일**: 신규 `app/services/benchmarking.py`, `tests/test_benchmarking.py` / 수정 `app/routes.py`, `app/templates/index.html`, `app/static/app.js`
- **내용**:
  - `benchmark_companies(기업명 목록)`: 후보 기업 전체에 대해 지표별 점수 수집 후 min-max 정규화 → 가중 합산 총점·순위 산출
  - 지표: 뉴스 감성 평균(기존 analyze_trends 결과), 수상실적 개수, 투자실적 개수, DART 재무(매출액·영업이익 — 결측 시 해당 지표 제외 정규화), 검증상태(verified 가점), 리스크 알림(감점)
  - 가중치는 `app/config.py`에 상수로 정의 (기본: 감성 0.3 / 수상 0.2 / 투자 0.2 / 재무 0.2 / 검증 0.1, 리스크는 감점)
  - `POST /api/companies/benchmark` 라우트: 연도별 대상 기업(Company 테이블) 전체 벤치마킹 실행 → 랭킹 JSON 반환
  - 프론트엔드: 랭킹 테이블 UI 추가 (기존 app.js 패턴 준수)
  - 엑셀 내보내기: 랭킹 전체 시트 추가 (평가위원회 배포용)
- **검증**: 정규화/순위 산출/결측 지표 제외/가중치 합산 테스트 통과
- **커밋**: `feat: add company benchmarking and ranking`

#### Task 11: 분석 근거 설명 자동 생성 (XAI 리포트)
- **파일**: 신규 `app/services/explainer.py`, `tests/test_explainer.py` / 수정 `app/routes.py`, `app/templates/index.html`, `app/static/app.js`
- **내용**:
  - `explain_score(기업명)`: 벤치마킹 총점을 지표별 기여도로 분해 → 각 지표의 원점수·정규화 점수·기여도(%)·근거 요약(뉴스 헤드라인 3건, DART 수치) 반환
  - 근거 요약은 기존 분석결과(Archive·VerificationResult·재무 데이터)에서 조립 — 신규 LLM 호출 없이 규칙 기반 생성 (비용·환각 리스크 최소화)
  - `GET /api/company/explain?corp_name=&year=` 라우트
  - 프론트엔드: 기업별 기여도 수평 막대 그래프 (Chart.js CDN — 기존 템플릿에 스크립트 추가)
  - 엑셀 리포트 "다차원 검증" 시트에 기여도 요약 행 추가
- **검증**: 기여도 합계 100% 검증/결측 지표 처리/근거 요약 생성 테스트 통과
- **커밋**: `feat: add explainable score breakdown report`

#### Task 12: 연도별 선정이력 트래킹 및 시상 카테고리
- **파일**: 신규 `app/services/history_service.py`, `tests/test_history_service.py` / 수정 `app/models.py`, `app/routes.py`, `app/templates/index.html`, `app/static/app.js`, `migrate_selection_history.py`
- **내용**:
  - `SelectionRecord` 모델 추가: 기업명, 연도, 선정등급(대상/우수/최우수 등), 총점, 지표별 점수 JSON, 리스크 이력 요약, 생성시각
  - 기존 DB 마이그레이션 스크립트 (1회 실행)
  - `record_selection(기업명, 연도, 등급, 점수)`: 시상 확정 시 기록 저장
  - `get_company_history(기업명)`: 연도별 점수 추이 반환
  - `derive_award_categories(연도)`: 자동 카테고리 산출 — "3년 연속 우수기업", "전년 대비 최다 성장"(총점 상승률 1위), "신규 진입 최고 점수" 등
  - `GET /api/companies/history?corp_name=`, `GET /api/companies/awards?year=` 라우트
  - 프론트엔드: 기업 상세에 연도별 점수 추이 라인 차트(Chart.js), 연도별 수상자 목록 화면
- **검증**: 이력 저장/추이 조회/카테고리 산출(연속 선정·성장률·신규) 테스트 통과
- **커밋**: `feat: add selection history tracking and award categories`

---

## 실행 순서 및 의존성

```
Task 1 (기반)
 ├─→ Task 2 → Task 3 (국세청)
 ├─→ Task 4 → Task 5 (DART)
 └─→ Task 6 → Task 7 → Task 8 (검증·리포트)
                          ├─→ Task 9  (리스크 모니터링)
                          ├─→ Task 10 (벤치마킹) ─→ Task 11 (XAI)
                          └─→ Task 12 (이력 트래킹)
```
- Task 1이 전체 선행 (모든 태스크가 Config 사용)
- Phase A 내: 국세청(2·3)과 DART(4·5)는 서로 독립 — 병렬 진행 가능
- Phase B는 Task 8 완료 후 시작 (VerificationResult·재무 데이터 재사용)
- Task 9·10·12는 상호 독립 — 병렬 가능, Task 11은 Task 10 결과(총점·지표 점수)에 의존

## 리스크 및 대응

| 리스크 | 대응 |
|---|---|
| 비상장·중소기업이 DART에 재무제표 없음 | "재무제표가 없습니다" 에러로 명시 반환, 리포트에는 N/A 표기 — 벤치마킹 시 해당 지표 제외 정규화 |
| 국세청 API는 사업자번호 필요하나 현재 Company에 번호 없음 | Task 8에서 컬럼 추가 + 입력 필드 제공, 미입력 시 "미확인" 표기 |
| LLM judge 자체의 오판 | temperature=0, 점수 임계치 미달 시 무조건 "검토 필요" → 사람 최종 확인 게이트 유지 |
| 검증 단계 추가로 분석 소요시간 증가 | 검증은 분석 완료 후 비동기 지점에서 실행, 실패해도 기존 리포트 생성은 정상 완료 |
| 리스크 키워드 오탐(동명 기업, 무관한 소송 뉴스) | 심각도는 참고 수준으로만 표기, 담당자 확인 플래그 필수 — 자동 감점은 "확인됨" 상태에만 적용 |
| 벤치마킹 가중치 논쟁 가능성 | 가중치를 Config 상수로 분리해 평가위원회 합의로 조정 가능, 엑셀에 가중치 명시 |
| 연도별 점수 산식이 바뀌면 추이 비교 왜곡 | SelectionRecord에 산식 버전 필드 포함, 버전 간 비교 시 주석 표기 |

## 완료 정의 (Definition of Done)

- 모든 테스트 통과 (`pytest tests/ -v`), 앱 정상 기동
- **Phase A**: 분석 1회 수행 시 검증 결과가 DB에 저장되고, SSE 이벤트로 검증 상태가 전달되며, 엑셀 리포트에 "다차원 검증" 시트가 생성됨
- **Phase B**: 리스크 감지 시 알림이 기록되고, 50개사 벤치마킹 랭킹이 산출되며, 기업별 기여도 그래프와 연도별 점수 추이가 화면에 표시됨
- 소스코드에 평문 API 키가 존재하지 않음
- 우수기업 50개사 일괄 처리를 고려해 외부 API 호출에 timeout·에러 처리가 모두 적용됨
