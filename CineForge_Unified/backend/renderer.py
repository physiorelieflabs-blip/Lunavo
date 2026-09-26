from __future__ import annotations

import os
import subprocess
from pathlib import Path

from .core.models import FilmProject, ShotStatus
from .core.store import ProjectStore


class Renderer:
    def __init__(self, store: ProjectStore):
        self.store = store

    def extract_boundary(self, video_path: str, destination: str) -> str:
        Path(destination).parent.mkdir(parents=True, exist_ok=True)
        command = [
            os.getenv("CINEFORGE_FFMPEG", "ffmpeg"),
            "-y",
            "-sseof", "-0.12",
            "-i", video_path,
            "-frames:v", "1",
            destination,
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0 or not Path(destination).exists():
            raise RuntimeError(result.stderr[-2000:] or "FFmpeg boundary extraction failed")
        return destination

    def assemble(self, project: FilmProject) -> str:
        ordered = sorted(project.shots, key=lambda x: x.index)
        if not ordered or any(s.status != ShotStatus.COMPLETE or not s.output_path for s in ordered):
            raise RuntimeError("Cannot assemble until every shot is complete")

        indexes = [s.index for s in ordered]
        if indexes != list(range(len(ordered))):
            raise RuntimeError("Shot indexes are not contiguous from zero")

        root = self.store.project_root(project.id)
        concat = root / "concat.txt"
        lines = []
        for shot in ordered:
            media = Path(shot.output_path).resolve()
            if not media.exists() or not media.is_file():
                raise RuntimeError(f"Missing rendered media for shot {shot.index + 1}")
            escaped = str(media).replace("'", "'\\''")
            lines.append("file '" + escaped + "'")
        concat.write_text("\n".join(lines) + "\n", encoding="utf-8")

        output = root / "final_movie.mp4"
        ffmpeg = os.getenv("CINEFORGE_FFMPEG", "ffmpeg")
        direct = subprocess.run(
            [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(output)],
            capture_output=True,
            text=True,
        )
        if direct.returncode == 0 and output.exists() and output.stat().st_size > 0:
            return str(output)

        fallback = subprocess.run(
            [
                ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
                "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k", str(output),
            ],
            capture_output=True,
            text=True,
        )
        if fallback.returncode != 0 or not output.exists() or output.stat().st_size == 0:
            raise RuntimeError(fallback.stderr[-3000:] or "FFmpeg assembly failed")
        return str(output)
