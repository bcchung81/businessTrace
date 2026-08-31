from fastapi import APIRouter

from app.config import has_research

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """인증 없이 열어 둔다 — 컨테이너 프로브에는 자격증명이 없다."""
    return {"status": "ok", "features": {"research": has_research()}}
