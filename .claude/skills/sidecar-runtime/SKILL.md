---
name: sidecar-runtime
description: sidecar/ 의 Python FastAPI 사이드카를 만들거나 고칠 때, 파이썬 의존성·버전을 바꿀 때, gpt-researcher 나 dartlab 을 다룰 때 사용한다. uv, pyproject.toml, requirements, venv, Dockerfile 의 파이썬 베이스 이미지를 건드리는 작업도 해당한다.
---

# 사이드카 파이썬 런타임 규약

## 핀: Python 3.12 + gpt-researcher==0.15.1

**로컬 기본 파이썬이 3.14 이므로 `uv` 로 3.12 를 강제해야 한다.**

gpt-researcher 0.16.0 은 `gpt_researcher/actions/query_processing.py` 에서 `Any`·`List` 를 import 하지 않는 업스트림 버그가 있다. Python 3.14 는 PEP 649 로 애노테이션을 지연 평가해 버그가 드러나지 않을 뿐, **코드가 정상인 것이 아니다.** 3.12/3.13 에서는 import 시점에 `NameError` 로 죽는다.

| 파이썬 | gpt-researcher 0.16.0 | 0.15.1 (핀) |
|---|---|---|
| 3.12 | FAIL | **PASS** ← 채택 |
| 3.13 | FAIL | PASS |
| 3.14 | PASS (버그가 가려질 뿐) | PASS |

언어의 애노테이션 평가 방식 변경이 실제 버그를 가려주는 데 의존하는 구성은 기반으로 삼지 않는다. 업스트림 수정 후 핀을 해제한다.

## 의존성·버전을 바꾸면 먼저 이 스크립트를 돌린다

```bash
python3 scripts/sidecar_env_check.py                 # 버전별 해결 매트릭스
python3 scripts/sidecar_env_check.py --install 3.12  # 실제 설치·import 검증
python3 scripts/sidecar_env_check.py -r <패키지>      # 임의 조합 검사
```

해결(resolve)만으로는 부족하다 — 마커 기반이라 실제 빌드·import 실패를 잡지 못한다. **`--install` 까지 통과해야 검증된 것이다.**

## 미검증 사항

위 실측은 **macOS arm64 기준**이다. 211개 패키지 트리의 리눅스 휠 가용성은 다를 수 있다. Task 3 에서 **컨테이너 안에서 같은 스크립트를 재실행**해 확인한다. venv 는 약 1.1GB 이므로 멀티스테이지 빌드로 런타임 스테이지에 venv 만 복사한다.

## 경계

- **루트에 Python 파일을 두지 않는다.** 전부 `sidecar/` 또는 `scripts/` (훅이 차단한다)
- `sidecar/pyproject.toml` 에 `requires-python = ">=3.12,<3.13"` 을 명시한다
- `tsconfig.json` 의 `exclude` 와 `eslint.config.mjs` 의 `globalIgnores` 에 `sidecar/` 를 추가해 Node 툴링이 훑지 않게 한다
- **사이드카는 선택적 계층이다.** 죽어도 뉴스 수집·GPT 분석·검증·리포트는 폴백으로 동작해야 한다
