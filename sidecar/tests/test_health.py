from fastapi.testclient import TestClient

from app.main import create_app


def test_health_reports_ok_without_auth():
    """컨테이너 프로브에는 자격증명이 없다 — 열려 있어야 한다."""
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
