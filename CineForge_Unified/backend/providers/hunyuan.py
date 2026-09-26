from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from .base import GenerationResult, ProviderError, VideoProvider
from ..core.models import FilmProject, Shot


class HunyuanProvider(VideoProvider):
    provider_id = "hunyuanvideo-1.5"

    def info(self):
        entry = os.getenv("CINEFORGE_HUNYUAN_ENTRY", "")
        model = os.getenv("CINEFORGE_HUNYUAN_MODEL_PATH", "")
        return bool(entry and model), "Official HunyuanVideo 1.5 CLI adapter"

    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        entry = os.getenv("CINEFORGE_HUNYUAN_ENTRY", "")
        model = os.getenv("CINEFORGE_HUNYUAN_MODEL_PATH", "")
        if not entry or not model:
            raise ProviderError(
                "Configure CINEFORGE_HUNYUAN_ENTRY and CINEFORGE_HUNYUAN_MODEL_PATH"
            )

        output = project_root / "outputs" / f"shot_{shot.index + 1:04d}.mp4"
        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            os.getenv("CINEFORGE_HUNYUAN_PYTHON", sys.executable),
            entry,
            "--prompt", shot.prompt,
            "--resolution", os.getenv("CINEFORGE_HUNYUAN_RESOLUTION", "480p"),
            "--model_path", model,
            "--aspect_ratio", os.getenv("CINEFORGE_HUNYUAN_ASPECT", "16:9"),
            "--video_length", os.getenv("CINEFORGE_HUNYUAN_FRAMES", "121"),
            "--output_path", str(output),
            "--offloading", os.getenv("CINEFORGE_HUNYUAN_OFFLOADING", "true"),
        ]
        if shot.input_image:
            command.extend(["--image_path", shot.input_image])

        completed = subprocess.run(command, capture_output=True, text=True)
        if completed.returncode != 0 or not output.exists():
            raise ProviderError(
                "HunyuanVideo generation failed: "
                + (completed.stderr[-3000:] or completed.stdout[-3000:])
            )
        return GenerationResult(provider=self.provider_id, output_path=str(output))
