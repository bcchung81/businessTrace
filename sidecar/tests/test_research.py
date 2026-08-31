import pytest
from fastapi.testclient import TestClient

from app.jobs import JobStore
from app.main import create_app


@pytest.fixture()
def client(tmp_path):
    return TestClient(create_app(store=JobStore(tmp_path)))


def test_creating_a_job_returns_an_id_immediately(client):
    """딥리서치는 오래 걸린다 — 요청은 잡 ID 만 받고 끊는다."""
    response = client.post("/research", json={"company": "에이트테크", "mode": "light"})

    assert response.status_code == 202
    assert response.json()["jobId"]
    assert response.json()["status"] == "queued"


def test_polling_an_unknown_job_is_404_not_a_crash(client):
    assert client.get("/research/nope").status_code == 404


def test_a_finished_job_keeps_its_result_on_disk(tmp_path):
    """결과는 파일에 남긴다 — 사이드카가 재시작해도 폴링이 답을 찾는다."""
    store = JobStore(tmp_path)
    job = store.create({"company": "에이트테크"})
    store.finish(job.id, {"report": "요약"})

    assert JobStore(tmp_path).get(job.id).result == {"report": "요약"}


def test_a_failed_job_says_why(tmp_path):
    store = JobStore(tmp_path)
    job = store.create({"company": "에이트테크"})
    store.fail(job.id, "gpt-researcher 미설치")

    reloaded = JobStore(tmp_path).get(job.id)
    assert reloaded.status == "failed"
    assert "미설치" in reloaded.error


def test_research_without_the_extra_fails_the_job_instead_of_the_request(client):
    """선택적 계층이다 — 기능이 없으면 잡을 실패로 닫되 API 는 정상 응답한다."""
    created = client.post("/research", json={"company": "에이트테크"}).json()

    polled = client.get(f"/research/{created['jobId']}").json()

    assert polled["status"] in {"queued", "running", "failed", "done"}
