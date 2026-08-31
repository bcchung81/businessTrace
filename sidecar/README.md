# 사이드카

파이썬 전용 라이브러리만 맡는 **선택적 계층**이다. 이 프로세스가 죽어도 뉴스 수집·분석·검증·리포트는
Next.js 안에서 그대로 돈다 — Next.js 쪽 클라이언트(`src/lib/services/sidecar.ts`)는 실패를 전부 `null` 로 접는다.

## 개발

```bash
cd sidecar
uv sync --python 3.12          # 3.12 핀 — 기본 파이썬이 3.14 라 uv 없이는 지켜지지 않는다
uv run pytest -q
uv run uvicorn app.main:app --reload --port 8000
```

Next.js 가 사이드카를 부르게 하려면 `.env` 에 `SIDECAR_URL=http://127.0.0.1:8000` 을 둔다.
**값이 없으면 호출 자체를 하지 않는다** — 사이드카 없이 도는 것이 기본이다.

## 엔드포인트

| 메서드 | 경로 | 상태 |
|---|---|---|
| GET | `/health` | 동작 — 설치된 선택 기능(`features.research`)을 함께 낸다 |
| POST | `/research` | 잡 구조 동작(202 + jobId) · 실행은 Task 15 |
| GET | `/research/{jobId}` | 동작 — queued/running/done/failed |
| POST | `/finance/normalize` | 501 · Task 6 |

잡은 파일 하나로 남는다(`SIDECAR_JOBS_DIR`). 사이드카를 재시작해도 폴링이 답을 찾는다.

## 딥리서치 의존성

`gpt-researcher==0.15.1` 은 선택 의존성이다(`uv sync --extra research`). 0.16.0 은 3.12 에서 import 가 죽는다 —
근거는 `.claude/skills/sidecar-runtime`. 트리가 약 1.1GB 라 기본 설치·이미지에서 뺐다.

**미검증**: 리눅스 휠 가용성은 macOS arm64 실측과 다를 수 있다. Task 15 에서 컨테이너 안의
`scripts/sidecar_env_check.py --install 3.12` 로 확인해야 한다.
