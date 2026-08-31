from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import has_research
from app.jobs import JobStore

router = APIRouter()


class ResearchRequest(BaseModel):
    company: str = Field(min_length=1)
    mode: str = "light"
    perspectives: list[str] | None = None


def run_research(store: JobStore, job_id: str) -> None:
    """딥리서치 실행 자리 — Task 15 에서 gpt-researcher 를 붙인다.

    추가 의존성이 없으면 요청이 아니라 잡을 실패로 닫는다. 사이드카는 선택적 계층이라
    호출한 쪽이 500 을 받는 대신 사유를 읽고 폴백할 수 있어야 한다.
    """
    store.start(job_id)
    if not has_research():
        store.fail(job_id, "딥리서치 의존성이 설치되지 않았습니다 (uv sync --extra research).")
        return
    store.fail(job_id, "딥리서치는 아직 구현되지 않았습니다 (Task 15).")


@router.post("/research", status_code=202)
def create_research(payload: ResearchRequest, background: BackgroundTasks, request: Request) -> dict:
    store: JobStore = request.app.state.jobs
    job = store.create(payload.model_dump())
    background.add_task(run_research, store, job.id)
    return {"jobId": job.id, "status": job.status}


@router.get("/research/{job_id}")
def read_research(job_id: str, request: Request) -> dict:
    store: JobStore = request.app.state.jobs
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="잡을 찾을 수 없습니다.")
    return {"jobId": job.id, "status": job.status, "result": job.result, "error": job.error}
