# Jev 적용 검토 (2026-09-24)

TypeSafe AI 의 **Jev**(2026-09-15 공개, "System One Model")를 성과돋보기 프로덕션에 붙일 수 있는지 검토한다.
결론부터: **판정 전용 보조층으로 제한 도입, 섀도 평가 먼저.** 텍스트 생성·숫자 추출·judge 대체에는 쓰지 않는다.

## 1. Jev 가 무엇인가

- 텍스트를 생성하지 않는다. `state`(문자열/JSON) + 타입이 정해진 질문들 → **확률이 붙은 타입 답**을 돌려준다
- 질문 타입 3종
  - `noul` — 명제가 참일 확률(0~1). 별도 confidence 없음
  - `choice` — 최대 255개 선택지 중 하나 + 선택지별 확률 + confidence
  - `score` — 2~10 단계 순서척도 + 단계별 확률 + confidence
- 엔드포인트 하나: `POST https://api.typesafe.ai/v1/systemone`, 본문 `{model, state, questions}`. 응답 `{answers, usage, model}`
- 가격 입력 $0.042/1M 토큰, 출력 무료. 지연 약 0.07~0.5초. 컨텍스트 요청당 64k(상태 32k + 가장 긴 질문)
- 모델 버전 고정 가능(`jev-1.13`), `jev-latest` 는 움직인다
- 스키마 밖 값은 구조적으로 나올 수 없다 — **형식 환각은 없지만 판단 오류는 그대로 있다**

## 2. 외부 평가에서 확인된 것

| 항목 | 내용 | 출처 성격 |
|---|---|---|
| judge 정확도 | 이진 pass/fail 500회 반복에서 오라클과 100% 일치(Sonnet 4.6 80%) · 환각 탐지 87%(Opus 5 와 동률, 비용 1/300) | 제3자 블로그·저장소 |
| 반복성 | 연속 점수 분산이 LLM judge 대비 92~913배 낮음. 단, 동일 요청 50회에 답 세트 15종 | 제3자 |
| 분류 | 짧은 입력·뚜렷한 라벨(스팸·감성·토픽)에서 gpt-5.4-mini 이상. 77개 의도 분류에서는 열세 | 제3자 |
| 질문 분해 | 피싱 판정 한 질문 62.6% → 다섯 질문 + 가중치 학습 95.0%. 문구만 바꿔 70%→96% | 제3자 |
| **한국어** | 영어 대비 **−6.5%p**. 공식 문서도 CJK 는 "동등하지 않다"고 명시 | 견고성 모음 저장소·공식 |
| **보정 실패** | choice 모드 과신(정답률 19%에 82.9% 부여), P(x)+P(¬x) 0.71~1.42 | 견고성 모음 |
| **프롬프트 인젝션** | 권위 프레이밍("사전 승인됨")에 흔들림 — 위험 명령 차단 확률 0.76→0.48. 공식 한계 문서도 인정 | Check Point·VentureBeat·공식 |
| 범위 밖 입력 | 기권 선택지를 주지 않으면 범위 밖 질문에도 확신 있게 답함 | 견고성 모음 |

주의: 공개 9일 된 모델이고, 수치 대부분이 감사되지 않은 제3자 자료다. 1차 문서(typesafe.ai)는
이번 조사 환경에서 직접 열람하지 못해 검색 요약으로 확인했다 — 도입 전 공식 문서로 다시 확인한다.

## 3. 현재 LLM 호출과 적합도

기업 1곳당 호출은 **3N + 2** 회다(N = primary 기사 수, 배치 기본 상한 20).

| 호출 | 위치 | 출력 | Jev 적합도 |
|---|---|---|---|
| 동향 — `is_about_company`·`about_confidence` | `analyzer.ts:253` | Y/N + 자가보고 확신도(문턱 0.7) | **높음.** noul 의 보정된 확률이 LLM 자가보고 확신도보다 원리상 낫다 |
| 동향 — `negative_kind` | 같은 호출 | enum 4종 | 중간. choice 과신 주의 → 종류별 noul 로 분해 |
| 동향 — `sentiment_score` −10~10 · 요약 | 같은 호출 | 21단계 정수 · 자유 텍스트 | **낮음.** score 는 최대 10단계라 척도가 바뀌고 랭킹 산식이 흔들린다. 요약은 생성 |
| 수상 판정 | `analyzer.ts:258` | Y/N + 수상명·사유 | **1차 게이트로 높음.** 대부분 N 이므로 Jev 가 걸러내고 Y 후보만 LLM 에 추출을 맡긴다 |
| 투자 판정 | `analyzer.ts:261` | Y/N + 라운드 + 금액(원) + 사유 | 게이트는 높음. 금액·라운드 추출은 **LLM 유지** — Jev 는 숫자를 뽑지 못한다 |
| 종합의견 | `analyzer.ts:316` | 자유 텍스트 | 해당 없음 |
| 검증 judge | `verification.ts:61` | 주장별 supported + 근거·반증 텍스트 | **대체 불가, 병행 가능.** 아래 4-3 |

## 4. 적용 방안

### 4-1. 단계 0 — 섀도 평가 (선행 필수, 비용 1달러 미만)

- 이미 쌓인 `AnalysisRun` 결과와 사람 검토 기록(이벤트 검토·일괄 검토)을 라벨로 쓴다. 50개사 × 약 20건 ≈ 1,000 기사
- 같은 기사에 Jev 를 돌려 **LLM 판정과의 일치율, 사람 라벨 대비 정확도, 확률 구간별 실제 정답률(보정 곡선)** 을 잰다
- 한국어 성능 저하가 우리 데이터에서 몇 %p 인지 여기서 확정한다. 공개 수치(−6.5%p)는 참고일 뿐이다
- 질문 문구에 따라 정확도가 20%p 이상 흔들리므로 문구 후보 2~3개를 함께 비교한다
- 통과 기준(제안): about-company 게이트 정확도가 현행 LLM 과 ±2%p 이내, 수상·투자 게이트 **재현율 ≥ 0.98**(놓치면 가점 누락)

### 4-2. 단계 1 — 기사 판정 게이트 (캐스케이드)

```
기사 → Jev { about: noul, award: noul, investment: noul, lawsuit/recall/sanction: noul × 3 }
  about < 0.3            → 무관 처리, LLM 호출 없음
  award/investment < 0.1 → N 확정, 해당 LLM 호출 생략
  그 외(불확실·양성)      → 기존 LLM 호출로 넘김 (추출·요약·감성)
```

- 기대 효과: 기사당 3회 호출 중 수상·투자 2회가 양성 후보에만 남는다. 절감률은 양성 비율에 달렸으니 단계 0 에서 측정
- **Jev 실패는 LLM 경로로 떨어진다.** N 기본값으로 떨어뜨리면 장애가 곧 가점 누락이 된다 — "검증 실패 = 신뢰 불가" 원칙과 같다
- about 게이트가 바뀌면 집계 대상 기사가 바뀌어 랭킹이 움직인다 → **산식 버전을 올린다**(`rank-v3` → 차기)

### 4-3. 단계 2 — judge 병행 (독립 신호 추가)

- judge 를 Jev 로 **바꾸지 않는다.** 근거(evidence)·반증(counter_evidence) 텍스트는 평가위원회 유의사항으로 노출되는 산출물이고, 이 제품은 환각 검증이 존재 이유라 judge 를 최저가 칸에 두지 않는다는 기존 결정과도 맞지 않는다
- 대신 주장마다 Jev noul 「이 주장은 기사 원문에 근거하는가」를 **추가 독립 신호**로 둔다. ③ evidence-match 처럼 judge 자신의 오판을 잡는 층이다
- 판정: LLM judge 와 Jev 가 어긋난 주장은 `needs_review` 로 보낸다. 통과 문턱을 **완화하는 데는 쓰지 않는다** — 오직 추가로 막는 방향

### 4-4. 쓰지 않을 곳

감성 점수, 요약·종합의견 생성, 금액·라운드·수상명 추출, judge 대체.

## 5. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 인젝션 — 기사 속 "공식 확인됨" 류 문구에 확률이 움직임 | 기존 `fenceUntrusted` 로 state 를 감싼다. **현재 judge 프롬프트는 LLM 이 만든 주장 문장을 울타리 없이 넣는다** — Jev 에 넘기기 전에 함께 막는다. Jev 결과는 차단 방향으로만 쓴다 |
| 한국어 성능 저하 | 단계 0 실측으로 결정. 미달이면 도입하지 않는다 |
| choice 과신·부정 비대칭 | choice 대신 noul 로 분해. 기권(`unclear`) 경로 확보 |
| 모델 변경 | `jev-latest` 금지, 버전 고정 후 실행 기록에 모델 문자열 저장 |
| 벤더 신생·데이터 경로 | 보내는 것은 공개 뉴스 본문·기업명·공공데이터 사실뿐이라 민감도는 낮다. 그래도 보존 정책 확인 후 사용. 서버 egress 허용 목록에 `api.typesafe.ai` 추가 |
| 벤더 이탈 | 스위치(`off`) 하나로 현행 경로 복귀. 오픈소스 대안으로 Nokia AnyJev(2026-09-23 공개, 오픈 LLM 을 판정 모델로 바꾸는 층)가 있으나 자체 호스팅 부담이 커 지금은 보류 |

## 6. 구현 스케치 (착수 시)

- `src/lib/services/jev.ts` — `decide(state, questions) → {answers, usage, model}`. **`LlmClient` 에 끼우지 않는다** — 인터페이스가 다르고, 섞으면 공급자 전환 스위치의 의미가 흐려진다
- SDK 없이 `fetch` 로 호출(OSS 의존성 0 유지). 키 `TYPESAFE_API_KEY`, 모델 `JEV_MODEL`(기본 버전 고정)
- 모드 `JEV_MODE=off|shadow|on`, 기본 `off`. **모르는 값은 던진다**(`LLM_PROVIDER` 와 같은 규칙). `env.ts` 부팅 검증에 추가
- `shadow` 는 판정을 기록만 하고 결과에 반영하지 않는다 — 단계 0 을 운영 데이터로 이어가는 경로
- 사용량을 `AnalysisRun.usageJson` 에 `jev` 키로 합산
- 테스트는 전부 mock. `scripts/api_smoke_test.py` 에 검사 함수 추가

## 7. 권고

1. 단계 0 섀도 평가를 먼저 돌린다 — 반나절, 비용 무시 가능
2. 수치가 기준을 넘으면 단계 1(기사 게이트)부터. 산식 버전을 함께 올린다
3. 단계 2(judge 병행)는 단계 1 운영이 안정된 뒤 — 차단 방향 신호로만

## 출처

- [Introducing System One Models & Jev — TypeSafe AI](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [API reference — TypeSafe AI](https://docs.typesafe.ai/api)
- [Jev Latest — OpenRouter](https://openrouter.ai/~typesafe/jev-latest)
- [Can Jev Be a Better Agent Evaluator? — LangChain](https://www.langchain.com/blog/jev-agent-evals-langsmith)
- [danielgshea/jev-as-a-judge](https://github.com/danielgshea/jev-as-a-judge)
- [Jev vs LLM-as-a-Judge — Arize AI](https://arize.com/blog/jev-llm-judge-benchmark/)
- [onlyoneaman/jev-eval](https://github.com/onlyoneaman/jev-eval)
- [Yifan-Lan/awesome-jev-robustness](https://github.com/Yifan-Lan/awesome-jev-robustness)
- [TypeSafe's Jev Scores 62.6% Asked Once and 95% Split Five Ways](https://www.beri.net/article/typesafe-jev-typed-decision-model-calibration-decomposition-shadow-eval)
- [Jev Is Not a Language Model, but It Breaks Like One — Check Point](https://blog.checkpoint.com/ai-security/jev-is-not-a-language-model-but-it-breaks-like-one-prompt-injection-against-a-typed-decision-model)
- [Companies are putting Jev in charge of AI agent decisions — VentureBeat](https://venturebeat.com/security/companies-are-putting-jev-in-charge-of-ai-agent-decisions-and-prompt-injection-can-influence-the-verdict)
- [yibie/awesome-jev](https://github.com/yibie/awesome-jev)
- [Nokia Open-Sources AnyJev — MarkTechPost](https://www.marktechpost.com/2026/09/23/nokia-open-sources-anyjev-a-training-free-layer-that-turns-any-open-llm-into-a-calibrated-decision-model/)
