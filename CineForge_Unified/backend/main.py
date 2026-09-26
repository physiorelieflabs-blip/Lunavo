from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .core.models import CreateProjectRequest, ProviderInfo
from .core.planner import build_project
from .core.store import ProjectStore
from .providers.comfyui import ComfyUIProvider
from .providers.hf_space import HFSpaceProvider
from .providers.hunyuan import HunyuanProvider
from .providers.ltx import LTXProvider
from .providers.wan import WanProvider
from .runner import CineForgeRunner


BASE = Path(__file__).resolve().parent.parent
WEB = BASE / "web"

store = ProjectStore()
_provider_map = {
    "huggingface": HFSpaceProvider(),
    "huggingface-space": HFSpaceProvider(),
    "comfyui": ComfyUIProvider(),
    "wan2.2": WanProvider(),
    "ltx-2": LTXProvider(),
    "hunyuanvideo-1.5": HunyuanProvider(),
}
providers = [
    _provider_map["huggingface-space"],
    _provider_map["comfyui"],
    _provider_map["wan2.2"],
    _provider_map["ltx-2"],
    _provider_map["hunyuanvideo-1.5"],
]
runner = CineForgeRunner(store, providers)

app = FastAPI(title="CineForge Unified", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

if WEB.exists():
    app.mount("/assets", StaticFiles(directory=WEB), name="assets")


@app.get("/")
def home():
    return FileResponse(WEB / "index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "service": "cineforge-unified"}


@app.get("/api/providers", response_model=list[ProviderInfo])
def provider_status():
    return [
        ProviderInfo(
            id=p.provider_id,
            available=p.info()[0],
            description=p.info()[1],
        )
        for p in providers
    ]


@app.post("/api/projects")
def create_project(request: CreateProjectRequest):
    project = build_project(
        request.title,
        request.brief,
        request.duration_seconds,
        request.shot_seconds,
        request.style,
    )
    return store.save(project)


@app.get("/api/projects")
def list_projects():
    return store.list()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    project = store.get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.post("/api/projects/{project_id}/next")
def generate_next(project_id: str):
    try:
        return runner.generate_next(project_id)
    except KeyError:
        raise HTTPException(404, "Project not found")
    except Exception as exc:
        raise HTTPException(409, str(exc))


@app.post("/api/projects/{project_id}/assemble")
def assemble(project_id: str):
    try:
        return {"output_path": runner.assemble(project_id)}
    except KeyError:
        raise HTTPException(404, "Project not found")
    except Exception as exc:
        raise HTTPException(409, str(exc))
