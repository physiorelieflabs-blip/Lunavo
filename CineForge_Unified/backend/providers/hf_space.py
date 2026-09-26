from __future__ import annotations

import json
import os
from pathlib import Path

from .base import GenerationResult, ProviderError, VideoProvider
from ..core.models import FilmProject, Shot


class HFSpaceProvider(VideoProvider):
    provider_id = "huggingface-space"

    def info(self):
        space = os.getenv("CINEFORGE_HF_SPACE", "")
        return bool(space), "Hugging Face Gradio Space adapter"

    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        try:
            from gradio_client import Client
        except ImportError as exc:
            raise ProviderError("Install gradio_client to use this backend") from exc

        space = os.getenv("CINEFORGE_HF_SPACE", "")
        api_name = os.getenv("CINEFORGE_HF_API_NAME", "/predict")
        if not space:
            raise ProviderError("CINEFORGE_HF_SPACE is required")

        raw_args = os.getenv("CINEFORGE_HF_ARGS_JSON", "[\"__PROMPT__\"]")
        template = json.loads(raw_args)
        args = []
        for value in template:
            if value == "__PROMPT__":
                args.append(shot.prompt)
            elif value == "__INPUT_IMAGE__":
                args.append(shot.input_image)
            elif value == "__INPUT_VIDEO__":
                args.append(shot.input_video)
            elif value == "__DURATION__":
                args.append(shot.duration_seconds)
            else:
                args.append(value)

        root = project_root / "outputs"
        root.mkdir(parents=True, exist_ok=True)
        output = root / f"shot_{shot.index + 1:04d}.mp4"

        client = Client(space)
        result = client.predict(*args, api_name=api_name)
        candidate = result[0] if isinstance(result, (tuple, list)) else result
        candidate_path = None
        if isinstance(candidate, str):
            candidate_path = candidate
        elif isinstance(candidate, dict):
            candidate_path = candidate.get("path") or candidate.get("url")
        if not candidate_path or not Path(candidate_path).exists():
            raise ProviderError("HF Space returned no local media path")
        Path(candidate_path).replace(output)
        return GenerationResult(provider=self.provider_id, output_path=str(output))
