from __future__ import annotations

from datetime import datetime, timezone
import threading

from .core.models import Attempt, ProjectStatus, ShotStatus
from .core.store import ProjectStore
from .providers.base import ProviderError, VideoProvider
from .renderer import Renderer


class CineForgeRunner:
    def __init__(self, store: ProjectStore, providers: list[VideoProvider]):
        self.store = store
        self.providers = providers
        self.renderer = Renderer(store)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock_for(self, project_id: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(project_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[project_id] = lock
            return lock

    def choose_provider(self) -> VideoProvider:
        for provider in self.providers:
            available, _ = provider.info()
            if available:
                return provider
        raise ProviderError(
            "No configured provider. Configure Wan 2.2, ComfyUI, "
            "Hugging Face Space, LTX-2, or HunyuanVideo."
        )

    def generate_next(self, project_id: str):
        with self._lock_for(project_id):
            return self._generate_next_locked(project_id)

    def _generate_next_locked(self, project_id: str):
        project = self.store.get(project_id)
        if not project:
            raise KeyError(project_id)

        shot = self.store.next_pending(project)
        if not shot:
            project.status = ProjectStatus.COMPLETE
            self.store.save(project)
            return project

        provider = self.choose_provider()
        shot.status = ShotStatus.RUNNING
        project.status = ProjectStatus.RUNNING
        attempt = Attempt(provider=provider.provider_id)
        shot.attempts.append(attempt)
        self.store.save(project)

        try:
            result = provider.generate(
                project,
                shot,
                self.store.project_root(project.id),
            )
            shot.output_path = result.output_path
            shot.status = ShotStatus.COMPLETE
            attempt.status = "complete"
            attempt.output_path = result.output_path
            attempt.finished_at = datetime.now(timezone.utc)

            boundary = (
                self.store.project_root(project.id)
                / "boundaries"
                / f"shot_{shot.index + 1:04d}.png"
            )
            shot.boundary_frame = self.renderer.extract_boundary(
                result.output_path, str(boundary)
            )

            if shot.index + 1 < len(project.shots):
                next_shot = project.shots[shot.index + 1]
                next_shot.input_video = result.output_path
                next_shot.input_image = shot.boundary_frame
                next_shot.continuity_in = shot.continuity_out

            project.cursor = max(project.cursor, shot.index + 1)
            project.status = (
                ProjectStatus.COMPLETE
                if all(s.status == ShotStatus.COMPLETE for s in project.shots)
                else ProjectStatus.PAUSED
            )
            self.store.save(project)
            return project
        except Exception as exc:
            shot.status = ShotStatus.FAILED
            attempt.status = "failed"
            attempt.error = str(exc)
            attempt.finished_at = datetime.now(timezone.utc)
            project.status = ProjectStatus.PAUSED
            self.store.save(project)
            raise

    def assemble(self, project_id: str) -> str:
        with self._lock_for(project_id):
            project = self.store.get(project_id)
            if not project:
                raise KeyError(project_id)
            output = self.renderer.assemble(project)
            project.assembly_path = output
            project.status = ProjectStatus.COMPLETE
            self.store.save(project)
            return output
