# 사이드카 — uv 로 3.12 를 고정해 굽는다. 기본 파이썬이 3.14 라 uv 없이는 핀이 지켜지지 않는다.
FROM python:3.12-slim AS builder
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock* ./
# 딥리서치 추가 의존성은 굽지 않는다 — 1.1GB 트리를 아직 쓰지 않는 라우터를 위해 넣지 않는다.
# Task 15 에서 `--extra research` 로 다시 굽고, 그때 컨테이너 안에서 sidecar_env_check 를 재실행한다.
RUN uv sync --no-dev --frozen 2>/dev/null || uv sync --no-dev

FROM python:3.12-slim AS runner
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    SIDECAR_JOBS_DIR=/app/jobs
RUN useradd --system --uid 1001 --create-home appuser
COPY --from=builder /app/.venv /app/.venv
COPY app ./app
RUN mkdir -p /app/jobs && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
