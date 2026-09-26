from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from .base import GenerationResult, ProviderError, VideoProvider
from ..core.models import FilmProject, Shot


class WanProvider(VideoProvider):
    provider_id = "wan2.2"

    def info(self):
        root = os.getenv("CINEFORGE_WAN_ROOT", "")
        ckpt = os.getenv("CINEFORGE_WAN_CKPT_DIR", "")
        return bool(root and ckpt), "Wan 2.2 official generate.py adapter"

    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        root = os.getenv("CINEFORGE_WAN_ROOT", "")
        ckpt = os.getenv("CINEFORGE_WAN_CKPT_DIR", "")
        if not root or not ckpt:
            raise ProviderError("Configure CINEFORGE_WAN_ROOT and CINEFORGE_WAN_CKPT_DIR")

        task = os.getenv("CINEFORGE_WAN_TASK", "t2v-A14B")
        if shot.input_image:
            task = os.getenv("CINEFORGE_WAN_I2V_TASK", "i2v-A14B")

        output = project_root / "outputs" / f"shot_{shot.index + 1:04d}.mp4"
        output.parent.mkdir(parents=True, exist_ok=True)

        command = [
            os.getenv("CINEFORGE_WAN_PYTHON", sys.executable),
            str(Path(root) / "generate.py"),
            "--task", task,
            "--size", os.getenv("CINEFORGE_WAN_SIZE", "1280*720"),
            "--frame_num", os.getenv("CINEFORGE_WAN_FRAMES", "81"),
            "--ckpt_dir", ckpt,
            "--prompt", shot.prompt,
            "--save_file", str(output),
            "--offload_model", os.getenv("CINEFORGE_WAN_OFFLOAD", "true"),
        ]
        if os.getenv("CINEFORGE_WAN_T5_CPU", "1") == "1":
            command.append("--t5_cpu")
        if shot.input_image:
            command.extend(["--image", shot.input_image])

        completed = subprocess.run(command, cwd=root, capture_output=True, text=True)
        if completed.returncode != 0:
            raise ProviderError(
                "Wan generation failed: "
                + (completed.stderr[-3000:] or completed.stdout[-3000:])
            )
        if not output.exists():
            raise ProviderError("Wan returned success without the expected MP4")
        return GenerationResult(provider=self.provider_id, output_path=str(output))
