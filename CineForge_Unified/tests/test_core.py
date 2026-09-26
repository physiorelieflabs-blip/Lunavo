from pathlib import Path

from backend.core.models import ShotStatus
from backend.core.planner import build_project
from backend.core.store import ProjectStore


def test_planner_creates_continuity_chain():
    project = build_project(
        "Test",
        "A hero walks through a city.",
        25,
        8,
        "cinematic realism",
    )
    assert len(project.shots) == 4
    assert project.shots[0].status == ShotStatus.PENDING
    assert project.shots[1].continuity_in.handoff == "Boundary state after shot 1"


def test_store_resumes_after_restart(tmp_path: Path):
    store = ProjectStore(str(tmp_path))
    project = build_project("Test", "A story.", 16, 8, "cinematic")
    store.save(project)
    loaded = store.get(project.id)
    assert loaded is not None
    assert store.next_pending(loaded).index == 0


def test_project_ids_cannot_escape_workspace(tmp_path: Path):
    store = ProjectStore(str(tmp_path))
    assert store.get("../outside") is None
    try:
        store.project_root("../outside")
    except ValueError:
        pass
    else:
        raise AssertionError("path traversal project id was accepted")


def test_renderer_refuses_partial_movie(tmp_path: Path):
    from backend.renderer import Renderer

    store = ProjectStore(str(tmp_path))
    project = build_project("Test", "A story.", 16, 8, "cinematic")
    store.save(project)
    try:
        Renderer(store).assemble(project)
    except RuntimeError as exc:
        assert "every shot is complete" in str(exc)
    else:
        raise AssertionError("partial movie was assembled")
