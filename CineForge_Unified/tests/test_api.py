import pytest
from fastapi.testclient import TestClient


def test_api_health_project_creation_and_final_route(tmp_path, monkeypatch):
    monkeypatch.setenv("CINEFORGE_DATA_DIR", str(tmp_path / "projects"))

    # Import after setting the data directory because the app creates its
    # ProjectStore at module import time.
    from backend.main import app

    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    created = client.post(
        "/api/projects",
        json={
            "title": "API verification",
            "brief": "A character enters a room and pauses.",
            "duration_seconds": 9,
            "shot_seconds": 4,
            "style": "cinematic realism",
        },
    )
    assert created.status_code == 200
    project = created.json()
    assert len(project["shots"]) == 3
    assert project["shots"][1]["continuity_in"]["handoff"] == "Boundary state after shot 1"

    final = client.get(f"/api/projects/{project['id']}/final")
    assert final.status_code == 404
