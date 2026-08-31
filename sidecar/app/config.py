"""사이드카 설정 — 환경변수만 읽는다."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path


def jobs_root() -> Path:
    return Path(os.environ.get("SIDECAR_JOBS_DIR", "/tmp/seonggwa-sidecar-jobs"))


def has_research() -> bool:
    """딥리서치 추가 의존성이 실제로 설치돼 있는지 — 없는 기능을 있다고 말하지 않는다."""
    return importlib.util.find_spec("gpt_researcher") is not None
