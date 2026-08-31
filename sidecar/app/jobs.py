"""딥리서치 잡 저장소 — 메모리 인덱스 + JSON 파일."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

JobStatus = Literal["queued", "running", "done", "failed"]


@dataclass
class Job:
    id: str
    status: JobStatus
    request: dict[str, Any]
    created_at: str
    result: dict[str, Any] | None = None
    error: str | None = None


class JobStore:
    """잡 하나를 파일 하나로 남긴다 — 사이드카가 재시작해도 폴링이 답을 찾는다.

    무상태 유지가 설계 전제라 DB 를 두지 않는다. 결과는 Next.js 가 가져간 뒤 버려도 된다.
    """

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, job_id: str) -> Path:
        return self.root / f"{job_id}.json"

    def _write(self, job: Job) -> Job:
        self._path(job.id).write_text(json.dumps(asdict(job), ensure_ascii=False), encoding="utf-8")
        return job

    def create(self, request: dict[str, Any]) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            status="queued",
            request=request,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        return self._write(job)

    def get(self, job_id: str) -> Job | None:
        path = self._path(job_id)
        if not path.exists():
            return None
        return Job(**json.loads(path.read_text(encoding="utf-8")))

    def _transition(self, job_id: str, **changes: Any) -> Job | None:
        job = self.get(job_id)
        if job is None:
            return None
        for key, value in changes.items():
            setattr(job, key, value)
        return self._write(job)

    def start(self, job_id: str) -> Job | None:
        return self._transition(job_id, status="running")

    def finish(self, job_id: str, result: dict[str, Any]) -> Job | None:
        return self._transition(job_id, status="done", result=result)

    def fail(self, job_id: str, error: str) -> Job | None:
        return self._transition(job_id, status="failed", error=error)
