# 목록 심각도 표기 · 수집 기본 기간 · 기업 정보 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ① 기업 목록의 심각도 `—` 를 "무보도/사건 없음"으로 말하고 낡은 최근 보도를 빗금으로 표시한다 ② 뉴스 수집 기본 기간을 최근 90일로 둔다 ③ 저장된 원천 payload 로 기업 상세에 기본 정보(대표·설립/개업일·주소·법인번호, 원천 일치 여부) · 종업원수 3원천 · 원천 칸 펼침 상세 · 인건비 추정·입퇴사 · 자산총계 · 상장 여부 · 재무 전년비를 보인다.

**Spec:** `docs/2026-08-30-api-response-fields.md` 1·2순위 · 브리프 §2-B·C·E·K · 사용자 결정 2026-08-31(세 묶음 함께)

## Global Constraints
- 목록 심각도: 30일 사건 없음 → `정보` 아이콘 + `무보도`; 사건이 한 번도 없으면 `정보` + `사건 없음`. 긴급도순에서 둘은 맨 뒤
- 최근 보도 30일 초과 → 날짜 뒤 `· 낡음`, 셀에 `hatch`
- 수집 기본 기간: 일괄 실행 패널 시작일 기본값 = 오늘-90일(편집 가능), `analyze-all.ts` 도 `--since` 없으면 90일
- 기업 정보는 전부 **저장된 payload** 에서 조립(`companyFacts.ts`, 순수). 원천이 둘 이상 같은 값을 주면 `일치`, 다르면 `불일치 · A/B` 를 함께 적는다(§2-D 문법). 추정값(인건비)은 `추정` 태그
- 재무 전년비는 파서에 `frmtrm_amount` 를 더해 `previous` 를 저장하고, 없는 기존 스냅샷은 `—`
- 주석 JSDoc 만, 외부 호출 mock

## Tasks
1. 목록 심각도·낡음 표기 + 수집 기본 기간 (`company-row.tsx`, `companyCards.ts` sort, `batch-runner.tsx`, `scripts/analyze-all.ts`)
2. 파서 확장: DART 재무 `previous{revenue,operatingIncome,netIncome}` · 프로필 `stockCode` (`dart.ts`, `dartCorpCode` 후보에서), 국민연금 `months[].hired/departed` 이미 있음
3. `companyFacts.ts` — payload → `CompanyFacts` {profile(대표·설립일·주소·법인번호, 각 값의 원천과 일치 여부), employees(연금·조달·금융위), listing, finance(당기·전기·증감%·자산), payroll(인당 기준소득·연 인건비 추정), turnover(12개월 입·퇴사·이직률), sourceDetails(원천별 펼침 줄)}
4. 화면: 헤더 기본 줄 · 고용 요약에 종업원 3원천/인건비/입퇴사 · 원천 스트립 칸 클릭 펼침 · DART 재무 줄(전년비·자산·상장)
5. 문서
