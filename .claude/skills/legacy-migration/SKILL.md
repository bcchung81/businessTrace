---
name: legacy-migration
description: backup/ 의 레거시 Flask 앱에서 무언가를 가져오거나 참조할 때 사용한다. 뉴스 수집 로직·GPT 프롬프트·엑셀 리포트 구성·이메일 템플릿·언론사 매핑을 이관하는 작업, 기존 SQLite 데이터를 Prisma 로 옮기는 작업에 해당한다. "기존 코드", "포팅", "이관", "Flask" 가 나오면 사용한다.
---

# 레거시 Flask 앱 활용 규약

`backup/` 에 있고 **gitignore 된다**. 원본 이력은 커밋 `1457554` 에 있다.

## 방침: 통째로 재사용하지 않는다

필요하면 참조해서 신규 작성하거나, 자산 성격의 것은 복사해서 쓴다. 판단 기준은 **"로직이냐 자산이냐"** 다.

| 복사해서 쓸 것 (운영에서 검증된 자산) | 참조만 하고 재작성할 것 |
|---|---|
| `domain_press_mapping.json` — 도메인→언론사 181건 | `app/routes.py` 4,642줄 — Route Handler + services 로 분해 |
| `app/news_analyzer.py` 의 GPT 프롬프트 문자열 | `app/static/app.js` 196KB, `style.css` 100KB |
| `app/routes.py:1520~2065` 의 엑셀 시트 구성·스타일 | `app/templates/*.html` 2,334줄 — React/shadcn 으로 |
| `app/email_service.py` 의 발송 템플릿 | `app/news_service.py` 의 수집·중복제거 휴리스틱 |

복사할 때는 그대로 옮기되 Python→TypeScript 변환과 네이밍만 현재 규약에 맞춘다.

**GPT 프롬프트 문구를 임의로 개선하지 않는다.** 운영에서 튜닝된 자산이라 문구가 바뀌면 분석 결과가 달라지고, 연도별 점수 추이 비교가 왜곡된다.

## 실제로 살아있는 경로 (2026-08-27 확인)

프론트 `static/js/app.js` 가 호출하는 분석 API 는 **`/api/analyze/direct` 하나**다 (`routes.py:811` → `analyzer.analyze_news_comprehensive_streaming`). 나머지 `/api/analyze/{all,trends,awards,investment,streaming}` 은 호출자가 없다.

- `routes.py:1058` 의 인라인 수상 프롬프트는 사장 코드다. **프롬프트 정본은 `news_analyzer.py` L1904·1959·2006(뉴스별 3분석)·L2275(종합의견)** 이다
- LLM 호출은 전부 OpenAI(`news_analyzer.py` 7곳 + `routes.py:1058`). 신규는 Anthropic 단일이며, 구글 뉴스용 `web_search_preview` 경로(L2078·2241)는 이관하지 않는다 — 본문은 크롤링으로 확보
- 본문 크롤러가 세 벌 있다(`news_analyzer.py:1370`, `routes.py:3791`, `news_service.py:786`). requests + BeautifulSoup 정적 크롤링, 브라우저 자동화 없음. **셋 다 이관하지 않는다** — 2026-08-27 실측에서 `article`/`.content` 범용 선택자가 같은 페이지의 다른 기사 목록까지 본문으로 긁어 3~5배 노이즈를 냈다. 신규는 `@mozilla/readability` 를 쓴다. 레거시에서 가져올 것은 네이버 `#dic_area` 안전망과 User-Agent 문자열뿐
- 구글 뉴스 링크 복원은 `googlenewsdecoder` 를 **런타임 pip install** 해서 썼다(`news_analyzer.py:1162~`, requirements 에 없음). 2024년 이후 토큰은 base64 가 아니라 구글 `batchexecute` 호출이 필요하다 — 신규는 프로토콜을 자체 구현하고 패키지·런타임 설치는 쓰지 않는다
- 레거시는 `requests.Session.verify=False` 로 SSL 검증을 껐다(`news_service.py:17`). 신규는 끄지 않는다
- 언론사 매핑은 두 벌이다: `domain_press_mapping.json`(181건, **어떤 코드도 읽지 않음**)과 `news_service.py:25~199` 하드코딩 `domain_to_press`(실제 동작본). 복사할 때 **둘을 합집합으로 병합**하고 충돌 시 하드코딩 쪽을 우선한다. 용도는 링크 도메인 → 출처명 변환뿐이며 수집에는 관여하지 않는다
- 네이버 API 는 검색 소스일 뿐 본문을 주지 않는다. 본문은 네이버·구글 모두 **링크 크롤링**으로 얻는다. 네이버 키는 `news_service.py:14~15` 에 하드코딩된 개발자센터 레거시 키(ID 20자/Secret 10자) — 커밋 이력에 남아 있으므로 폐기 대상
- RSS 소스는 **구글 뉴스 검색 RSS 하나**뿐이다 (`news_service.py:627`). 네이버는 REST API 다. 구글 RSS 링크(`news.google.com/rss/articles/<base64>`) 복원 로직은 `news_analyzer.py:1162~1340`

## 이관 대상 데이터 위치

Flask instance 폴더 관례에 따라 **`backup/instance/news_homepage.db`** 가 실데이터다 (users 10 / archives 3 / companies 42).

- `backup/news_homepage.db` — **빈 파일**. 쓰지 말 것
- `backup/news_homepage.db.backup` — 오래된 스냅샷 (users 3 / archives 7). 쓰지 말 것

## 주의

**`backup/` 은 gitignore 되므로 복사해 온 것만 살아남는다.** 이 폴더를 정리하기 전에 필요한 자산을 모두 추출했는지 확인할 것.
