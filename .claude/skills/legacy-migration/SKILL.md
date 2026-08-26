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

## 이관 대상 데이터 위치

Flask instance 폴더 관례에 따라 **`backup/instance/news_homepage.db`** 가 실데이터다 (users 10 / archives 3 / companies 42).

- `backup/news_homepage.db` — **빈 파일**. 쓰지 말 것
- `backup/news_homepage.db.backup` — 오래된 스냅샷 (users 3 / archives 7). 쓰지 말 것

## 주의

**`backup/` 은 gitignore 되므로 복사해 온 것만 살아남는다.** 이 폴더를 정리하기 전에 필요한 자산을 모두 추출했는지 확인할 것.
