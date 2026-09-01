---
name: sidecar-runtime
description: sidecar/ 의 Python FastAPI 사이드카를 만들거나 고칠 때, 파이썬 의존성·버전을 바꿀 때 사용한다. uv, pyproject.toml, requirements, venv, Dockerfile 의 파이썬 베이스 이미지를 건드리는 작업도 해당한다.
---
# 사이드카 파이썬 런타임 규약

## 이 계층에는 지금 소비자가 없다

세울 때의 두 이유가 2026-09-01 에 모두 사라졌다.

- **딥리서치(gpt-researcher)** — 폐기
- **재무 정규화(dartlab)** — 채택하지 않음. `Company(stockCode)` 로 상장사만 다뤄 50개사 중 4개사에만 닿았고,
  그 넷은 이미 재무가 있던 기업이다. 비율은 `src/lib/services/financeRatios.ts` 에서 자체 계산한다

`sidecar/` 는 `/health` 만 남은 껍데기다. **존치 여부는 미결이다.** 파이썬 전용 라이브러리를 다시 들일 때
이 문서의 규약이 그대로 적용된다.

## 핀: Python 3.12

**로컬 기본 파이썬이 3.14 이므로 `uv` 로 3.12 를 강제해야 한다.** `sidecar/pyproject.toml` 의
`requires-python = ">=3.12,<3.13"` 만으로는 지켜지지 않는다 — `uv sync --python 3.12` 로 만든다.

## 의존성·버전을 바꾸면 먼저 이 스크립트를 돌린다

```bash
python3 scripts/sidecar_env_check.py                 # 버전별 해결 매트릭스
python3 scripts/sidecar_env_check.py --install 3.12  # 실제 설치·import 검증
python3 scripts/sidecar_env_check.py -r <패키지>      # 임의 조합 검사
```

해결(resolve)만으로는 부족하다 — 마커 기반이라 실제 빌드·import 실패를 잡지 못한다.
**`--install` 까지 통과해야 검증된 것이다.**

새 라이브러리를 들일 때는 **애노테이션 평가 방식에 기대는 구성을 채택하지 않는다.** 과거에 gpt-researcher
0.16.0 이 3.14 에서만 통과했는데, PEP 649 의 지연 평가가 실제 import 버그를 가려준 것이었다.
3.12 에서 죽는 코드는 정상이 아니다.

## 미검증

이미지 빌드는 이 저장소를 만든 환경에 Docker 데몬이 없어 확인하지 못했다. 리눅스 휠 가용성은
macOS arm64 실측과 다를 수 있으므로, 파이썬 의존성을 다시 들이면 **컨테이너 안에서** 같은 스크립트를 재실행한다.

## 경계

- **루트에 Python 파일을 두지 않는다.** 전부 `sidecar/` 또는 `scripts/` (훅이 차단한다)
- `tsconfig.json` 의 `exclude` 와 `eslint.config.mjs` 의 `globalIgnores` 에 `sidecar/` 가 들어 있어야 한다
- **사이드카는 선택적 계층이다.** 죽어도 뉴스 수집·GPT 분석·검증·리포트는 폴백으로 동작해야 한다 —
  `src/lib/services/sidecar.ts` 는 `SIDECAR_URL` 이 없으면 호출조차 하지 않고 실패는 전부 null 로 접는다
