from __future__ import annotations

import copy
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

from .base import GenerationResult, ProviderError, VideoProvider
from ..core.models import FilmProject, Shot


def replace_tokens(value: Any, tokens: dict[str, str]) -> Any:
    if isinstance(value, dict):
        return {k: replace_tokens(v, tokens) for k, v in value.items()}
    if isinstance(value, list):
        return [replace_tokens(v, tokens) for v in value]
    if isinstance(value, str):
        for key, replacement in tokens.items():
            value = value.replace(key, replacement)
        return value
    return value


class ComfyUIProvider(VideoProvider):
    provider_id = "comfyui"

    def info(self):
        url = os.getenv("CINEFORGE_COMFY_URL", "")
        return bool(url), "ComfyUI API adapter with drop-in API workflows"

    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        base = os.getenv("CINEFORGE_COMFY_URL", "").rstrip("/")
        workflow_path = os.getenv("CINEFORGE_COMFY_WORKFLOW", "")
        if not base or not workflow_path:
            raise ProviderError("Configure CINEFORGE_COMFY_URL and CINEFORGE_COMFY_WORKFLOW")

        workflow = json.loads(Path(workflow_path).read_text(encoding="utf-8"))
        output = project_root / "outputs" / f"shot_{shot.index + 1:04d}.mp4"
        output.parent.mkdir(parents=True, exist_ok=True)

        tokens = {
            "__PROMPT__": shot.prompt,
            "__NEGATIVE_PROMPT__": shot.negative_prompt,
            "__INPUT_IMAGE__": shot.input_image or "",
            "__INPUT_VIDEO__": shot.input_video or "",
            "__DURATION__": str(shot.duration_seconds),
            "__SHOT_INDEX__": str(shot.index),
        }
        workflow = replace_tokens(copy.deepcopy(workflow), tokens)
        client_id = f"cineforge-{project.id}-{shot.id}"

        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{base}/prompt",
                json={"prompt": workflow, "client_id": client_id},
            )
            response.raise_for_status()
            prompt_id = response.json().get("prompt_id")
            if not prompt_id:
                raise ProviderError("ComfyUI did not return prompt_id")

            deadline = time.time() + int(os.getenv("CINEFORGE_COMFY_TIMEOUT", "7200"))
            while time.time() < deadline:
                history = client.get(f"{base}/history/{prompt_id}")
                history.raise_for_status()
                payload = history.json().get(prompt_id)
                if payload and payload.get("outputs"):
                    media = []
                    for node in payload["outputs"].values():
                        for key in ("videos", "gifs", "images"):
                            media.extend(node.get(key, []))
                    if not media:
                        raise ProviderError("ComfyUI finished without a media result")

                    item = media[-1]
                    filename = item.get("filename")
                    if not filename:
                        raise ProviderError("ComfyUI result has no filename")
                    view = client.get(
                        f"{base}/view",
                        params={
                            "filename": filename,
                            "subfolder": item.get("subfolder", ""),
                            "type": item.get("type", "output"),
                        },
                    )
                    view.raise_for_status()
                    output.write_bytes(view.content)
                    return GenerationResult(provider=self.provider_id, output_path=str(output))
                time.sleep(2)

        raise ProviderError("ComfyUI generation timed out")
