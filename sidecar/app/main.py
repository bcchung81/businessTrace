"""성과돋보기 사이드카 — 파이썬 전용 라이브러리만 맡는 선택적 계층.

이 프로세스가 죽어도 뉴스 수집·분석·검증·리포트는 Next.js 안에서 그대로 돈다.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.config import jobs_root
from app.jobs import JobStore
from app.routers import finance, health, research


def create_app(store: JobStore | None = None) -> FastAPI:
    app = FastAPI(title="성과돋보기 사이드카", version="0.1.0")
    app.state.jobs = store or JobStore(jobs_root())
    app.include_router(health.router)
    app.include_router(research.router)
    app.include_router(finance.router)
    return app


app = create_app()
