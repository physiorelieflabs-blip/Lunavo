from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from .models import FilmProject, ShotStatus


class ProjectStore:
    # Resume-safe persistence pattern adapted from the documented
    # Continuity Studio and Podframes workflows.
    def __init__(self, root: str | None = None):
        self.root = Path(root or os.getenv("CINEFORGE_DATA_DIR", "data/projects")).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _project_dir(self, project_id: str) -> Path:
        if not project_id or project_id in {".", ".."} or "/" in project_id or "\" in project_id:
            raise ValueError("Invalid project id")
        path = (self.root / project_id).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError("Invalid project path")
        return path

    def _path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "project.json"

    def save(self, project: FilmProject) -> FilmProject:
        with self._lock:
            project.updated_at = datetime.now(timezone.utc)
            path = self._path(project.id)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(
                json.dumps(project.model_dump(mode="json"), indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            tmp.replace(path)
        return project

    def get(self, project_id: str) -> FilmProject | None:
        try:
            path = self._path(project_id)
        except ValueError:
            return None
        if not path.exists():
            return None
        return FilmProject.model_validate_json(path.read_text(encoding="utf-8"))

    def list(self) -> list[FilmProject]:
        projects: list[FilmProject] = []
        for path in self.root.glob("*/project.json"):
            try:
                projects.append(FilmProject.model_validate_json(path.read_text(encoding="utf-8")))
            except Exception:
                continue
        return sorted(projects, key=lambda p: p.updated_at, reverse=True)

    def next_pending(self, project: FilmProject):
        for shot in sorted(project.shots, key=lambda s: s.index):
            if shot.status in {ShotStatus.PENDING, ShotStatus.FAILED}:
                return shot
        return None

    def project_root(self, project_id: str) -> Path:
        root = self._project_dir(project_id)
        root.mkdir(parents=True, exist_ok=True)
        return root
