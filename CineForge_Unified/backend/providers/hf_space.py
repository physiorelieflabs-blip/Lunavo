from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import urlparse

import httpx

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

        raw_args = os.getenv("CINEFORGE_HF_ARGS_JSON", '["__PROMPT__"]')
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
        candidate_url = None
        if isinstance(candidate, str):
            parsed = urlparse(candidate)
            if parsed.scheme in {"http", "https"}:
                candidate_url = candidate
            else:
                candidate_path = Path(candidate)
        elif isinstance(candidate, dict):
            raw_path = candidate.get("path")
            raw_url = candidate.get("url")
            if raw_path:
                candidate_path = Path(raw_path)
            elif raw_url:
                candidate_url = raw_url

        if candidate_path and candidate_path.exists():
            candidate_path.replace(output)
        elif candidate_url:
            with httpx.stream("GET", candidate_url, follow_redirects=True, timeout=300.0) as response:
                response.raise_for_status()
                with output.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        handle.write(chunk)
        else:
            raise ProviderError("HF Space returned no usable media path or URL")

        if not output.exists() or output.stat().st_size == 0:
            raise ProviderError("HF Space completed without a usable media file")

        return GenerationResult(provider=self.provider_id, output_path=str(output))
