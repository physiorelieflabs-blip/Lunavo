from __future__ import annotations

# Portions adapted from Nautilus Studio:
# https://github.com/yeahdongcn/nautilus-studio
# Apache License 2.0. See THIRD_PARTY_NOTICES.md.

from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:16]}"


class ContinuationMode(str, Enum):
    FAST = "fast"
    QUALITY = "quality"
    EXTEND = "extend"


class ShotStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class ProjectStatus(str, Enum):
    PLANNED = "planned"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETE = "complete"
    FAILED = "failed"


class ContinuityState(BaseModel):
    characters: list[str] = Field(default_factory=list)
    wardrobe: list[str] = Field(default_factory=list)
    props: list[str] = Field(default_factory=list)
    location: str = ""
    lighting: str = ""
    camera: str = ""
    action: str = ""
    audio: str = ""
    handoff: str = ""


class Attempt(BaseModel):
    id: str = Field(default_factory=lambda: new_id("attempt"))
    provider: str
    status: str = "started"
    started_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None
    output_path: str | None = None
    error: str | None = None


class Shot(BaseModel):
    id: str = Field(default_factory=lambda: new_id("shot"))
    index: int
    duration_seconds: float
    prompt: str
    negative_prompt: str = ""
    status: ShotStatus = ShotStatus.PENDING
    attempts: list[Attempt] = Field(default_factory=list)
    output_path: str | None = None
    boundary_frame: str | None = None
    continuity_in: ContinuityState = Field(default_factory=ContinuityState)
    continuity_out: ContinuityState = Field(default_factory=ContinuityState)
    continuation_mode: ContinuationMode = ContinuationMode.EXTEND
    input_image: str | None = None
    input_video: str | None = None


class FilmProject(BaseModel):
    id: str = Field(default_factory=lambda: new_id("film"))
    title: str
    brief: str
    duration_seconds: int = Field(ge=1)
    shot_seconds: float = Field(default=8, ge=2, le=20)
    style: str = "cinematic realism"
    status: ProjectStatus = ProjectStatus.PLANNED
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    cursor: int = 0
    shots: list[Shot] = Field(default_factory=list)
    assembly_path: str | None = None


class CreateProjectRequest(BaseModel):
    title: str = "Untitled film"
    brief: str = Field(min_length=3)
    duration_seconds: int = Field(default=60, ge=1, le=86400)
    shot_seconds: float = Field(default=8, ge=2, le=20)
    style: str = "cinematic realism"


class ProviderInfo(BaseModel):
    id: str
    available: bool
    description: str
