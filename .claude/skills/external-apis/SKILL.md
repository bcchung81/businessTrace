---
name: external-apis
description: 국세청 휴폐업·OpenDART 재무/공시/사업자번호·나라장터 조달업체·네이버 뉴스 검색·Tavily API를 호출하는 코드를 쓰거나 디버깅할 때 사용한다. 실측으로 확정된 엔드포인트·인증 방식·에러 코드 해석과, 과거에 실제로 틀렸던 함정을 담고 있다. data.go.kr 인증키, serviceKey, NCP_APIGW, corp_code, bizno 를 다룰 때도 사용한다.
---

# 외부 API 연동 규약

`scripts/api_smoke_test.py` 가 실제 호출로 검증한 결과다. **재검증 없이 뒤집지 말 것.**

```bash
uv run --python 3.12 --with requests --with python-dotenv scripts/api_smoke_test.py
```

API 연동 코드를 바꾼 뒤에는 이 스크립트를 돌려 회귀를 확인한다. 신규 API 를 추가하면 검사 함수도 함께 추가한다.

## data.go.kr 인증키 (국세청·나라장터 공용)

**`.env` 에 Decoding 키를 넣고 항상 쿼리 파라미터로 전달한다.** 키 종류와 전달 방식은 짝이 맞아야 한다.

| 키 | 전달 방식 | 결과 |
|---|---|---|
| **Decoding** | **params / `URL.searchParams.set()`** | **200** ← 이 조합만 쓴다 |
| Decoding | URL 문자열 직접 삽입 | 401 (`+` 가 공백으로 해석) |
| Encoding | params | 401 (`%` 가 이중 인코딩) |
| Encoding | URL 문자열 직접 삽입 | 200 (동작하지만 채택하지 않음) |

fetch·axios 가 파라미터를 자동 인코딩하는 기본 동작과 짝이 맞기 때문에 Decoding 키를 택했다. Encoding 키를 저장하면 "인코딩하지 말 것"이라는 암묵적 규칙이 생겨 깨지기 쉽다.

**템플릿 문자열로 키를 URL 에 넣지 않는다.** 훅이 차단한다 — [사고 기록](../../../docs/incidents.md) 참조.

## data.go.kr 에러 코드 구분

- `NO_OPENAPI_SERVICE_ERROR` → **경로 불일치**. 미구독으로 오진하지 말 것
- `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` → 미구독

## 국세청 휴폐업

`POST https://api.odcloud.kr/api/nts-businessman/v1/status`, body `{"b_no": ["1248100998"]}`. `b_stt_cd == "01"` 이 계속사업자.

## OpenDART

- 사업자번호: 기업개황 `company.json` 의 `bizr_no` (삼성전자 1248100998, 올림플래닛 1208824298 확인)
- 재무: `fnlttSinglAcnt` + `reprt_code=11011`(사업보고서)
- 공시: `list.json` 은 **날짜 범위를 명시해야 한다**. 생략하면 당일 공시만 조회되어 "0건 성공"이라는 오탐이 난다
- `corpCode.xml` 은 약 20MB 이므로 반드시 캐시한다 (Task 5 의 24h TTL 캐시)

**재무 결측이 주 경로다.** 검증 대상 5개사 중 4개사는 DART 고유번호조차 없고, 올림플래닛은 공시는 있으나 `fnlttSinglAcnt`(상장사 대상)로는 재무제표가 나오지 않는다. 벤치마킹의 결측 지표 제외 정규화는 예외 처리가 아니라 **기본 동작**이다.

## 나라장터 조달업체

```
https://apis.data.go.kr/1230000/ao/UsrInfoService02/getPrcrmntCorpBasicInfo02
```

**서비스명에도 `02` 가 붙는다** — 빠뜨리면 `NO_OPENAPI_SERVICE_ERROR`. `inqryDiv=3` + `bizno` 로 **사업자번호 조회만** 가능하고 업체명 역검색은 없다. 인증키는 `NTS_SERVICE_KEY` 공용.

응답에 `emplyeNum`(종업원수)·`corpBsnsDivNm`(조달업무구분)·`opbizDt`(개업일)·`mnfctDivNm`(제조구분)이 온다. **DART 에 재무가 없는 비상장 기업도 여기선 잡히므로** Task 12 지표 보강에 쓸 수 있다.

## 네이버 뉴스 검색 — API HUB 로 이관됨

developers.naver.com 애플리케이션 등록 화면의 "사용 API" 목록에 **검색·데이터랩이 없는 것이 정상**이다. 2026-07-31 에 신규 신청이 종료됐다. 설정 실수로 오진하지 말 것.

| | 개발자센터 (레거시) | API HUB (현재 사용) |
|---|---|---|
| 엔드포인트 | `openapi.naver.com/v1/search/news.json` | `naverapihub.apigw.ntruss.com/search/v1/news` |
| 헤더 | `X-Naver-Client-Id` / `X-Naver-Client-Secret` | `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` |
| env | `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | `NCP_APIGW_API_KEY_ID` / `NCP_APIGW_API_KEY` |
| 키 길이 | ID 20자 / Secret 10자 | ID 10자 / Secret 40자 |

**엔드포인트와 헤더는 한 쌍으로 바꿔야 한다** — HUB 키를 레거시 엔드포인트에 쓰면 `NID AUTH Result Invalid (1000)`. 응답 필드(`title`·`originallink`·`link`·`description`·`pubDate`)는 동일하므로 **파서는 공용이고 엔드포인트·헤더만 분기**한다.

무료이나 향후 유료화 예정이고 초과 시 429. 쇼핑·책·전문자료 검색은 대체 없이 완전 종료됐다.

## 환경변수

전부 `.env`(gitignore 됨): `ANTHROPIC_API_KEY`(LLM 은 Anthropic 단일, 기본 모델 `claude-sonnet-5`), `NCP_APIGW_API_KEY_ID`·`NCP_APIGW_API_KEY`, `DART_API_KEY`, `NTS_SERVICE_KEY`, `TAVILY_API_KEY`, `GMAIL_*`, `SMTP_*`.
