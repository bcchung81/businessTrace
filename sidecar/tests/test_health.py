from fastapi.testclient import TestClient

from app.main import create_app


def test_health_reports_ok_without_auth():
    """컨테이너 프로브에는 자격증명이 없다 — 열려 있어야 한다."""
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_names_the_optional_extras_it_has():
    """딥리서치가 설치돼 있는지를 밝힌다 — 없는 기능을 있다고 읽지 않게."""
    client = TestClient(create_app())

    body = client.get("/health").json()

    assert "research" in body["features"]
    assert isinstance(body["features"]["research"], bool)
