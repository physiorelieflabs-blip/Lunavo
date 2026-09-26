from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from .base import GenerationResult, ProviderError, VideoProvider
from ..core.models import FilmProject, Shot


class LTXProvider(VideoProvider):
    provider_id = "ltx-2"

    def info(self):
        entry = os.getenv("CINEFORGE_LTX_ENTRY", "")
        checkpoint = os.getenv("CINEFORGE_LTX_DISTILLED_CHECKPOINT", "")
        gemma = os.getenv("CINEFORGE_LTX_GEMMA_ROOT", "")
        return bool(entry and checkpoint and gemma), "Official LTX-2 pipeline CLI adapter"

    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        entry = os.getenv("CINEFORGE_LTX_ENTRY", "ltx_pipelines.distilled")
        checkpoint = os.getenv("CINEFORGE_LTX_DISTILLED_CHECKPOINT", "")
        gemma = os.getenv("CINEFORGE_LTX_GEMMA_ROOT", "")
        spatial = os.getenv("CINEFORGE_LTX_SPATIAL_UPSAMPLER", "")
        if not checkpoint or not gemma or not spatial:
            raise ProviderError(
                "Configure CINEFORGE_LTX_DISTILLED_CHECKPOINT, "
                "CINEFORGE_LTX_GEMMA_ROOT and CINEFORGE_LTX_SPATIAL_UPSAMPLER"
            )

        output = project_root / "outputs" / f"shot_{shot.index + 1:04d}.mp4"
        output.parent.mkdir(parents=True, exist_ok=True)
        command = [
            os.getenv("CINEFORGE_LTX_PYTHON", sys.executable),
            "-m",
            entry,
            "--distilled-checkpoint-path", checkpoint,
            "--gemma-root", gemma,
            "--spatial-upsampler-path", spatial,
            "--num-frames", os.getenv("CINEFORGE_LTX_FRAMES", "121"),
            "--frame-rate", os.getenv("CINEFORGE_LTX_FPS", "24"),
            "--width", os.getenv("CINEFORGE_LTX_WIDTH", "768"),
            "--height", os.getenv("CINEFORGE_LTX_HEIGHT", "512"),
            "--output-path", str(output),
            "--prompt", shot.prompt,
        ]
        completed = subprocess.run(command, capture_output=True, text=True)
        if completed.returncode != 0 or not output.exists():
            raise ProviderError(
                "LTX generation failed: "
                + (completed.stderr[-3000:] or completed.stdout[-3000:])
            )
        return GenerationResult(provider=self.provider_id, output_path=str(output))
