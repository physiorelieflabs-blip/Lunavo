from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from pydantic import BaseModel, Field

from ..core.models import FilmProject, Shot


class GenerationResult(BaseModel):
    provider: str
    output_path: str
    metadata: dict = Field(default_factory=dict)


class ProviderError(RuntimeError):
    pass


class VideoProvider(ABC):
    provider_id = "base"

    @abstractmethod
    def info(self) -> tuple[bool, str]:
        raise NotImplementedError

    @abstractmethod
    def generate(self, project: FilmProject, shot: Shot, project_root: Path) -> GenerationResult:
        raise NotImplementedError
