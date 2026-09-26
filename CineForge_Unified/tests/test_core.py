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


def test_runner_end_to_end_with_synthetic_provider(tmp_path, monkeypatch):
    import subprocess
    from pathlib import Path

    from backend.providers.base import GenerationResult, VideoProvider
    from backend.runner import CineForgeRunner

    class FakeProvider(VideoProvider):
        provider_id = "fake-test"

        def info(self):
            return True, "synthetic"

        def generate(self, project, shot, project_root):
            output = project_root / "outputs" / f"test_{shot.index:04d}.mp4"
            output.parent.mkdir(parents=True, exist_ok=True)
            color = "red" if shot.index % 2 == 0 else "blue"
            subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"color=c={color}:s=160x90:d=2:r=24",
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", str(output),
                ],
                check=True,
            )
            return GenerationResult(provider=self.provider_id, output_path=str(output))

    monkeypatch.setenv("CINEFORGE_DATA_DIR", str(tmp_path / "projects"))
    store = ProjectStore(str(tmp_path / "projects"))
    project = build_project("E2E", "A hero walks.", 6, 2, "cinematic")
    store.save(project)
    runner = CineForgeRunner(store, [FakeProvider()])

    for _ in range(3):
        runner.generate_next(project.id)

    reloaded = store.get(project.id)
    assert reloaded is not None
    assert reloaded.cursor == 3
    assert all(shot.status == ShotStatus.COMPLETE for shot in reloaded.shots)
    output = runner.assemble(project.id)
    assert Path(output).exists()
    assert Path(output).stat().st_size > 0
