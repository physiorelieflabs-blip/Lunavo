# CineForge Unified

Made by LN.

CineForge Unified is an integration layer that combines established filmmaking workflow ideas and existing model runtimes instead of rewriting the models.

Selected sources:

- Nautilus Studio: long-form Film IR, execution planning and pluggable provider architecture.
- Continuity Studio: restart-safe production memory, continuity handoff and attempt history.
- Podframes: artifact-oriented resumability and per-unit retry behavior.
- Omni Video Factory: extension-oriented generation workflow and hosted-space execution.
- Wan 2.2: primary local video generation adapter.
- ComfyUI: workflow-based remote execution adapter.
- LTX-2: optional official external runtime for synchronized audio/video.
- HunyuanVideo 1.5: optional external runtime where its license and deployment limits permit.

Movie flow:

story -> shot plan -> generation -> saved artifact -> boundary frame -> next shot -> final assembly

The project file is saved after every completed stage. A stopped run resumes from the first incomplete shot. Previous successful artifacts and failed attempts are not silently discarded.

GPU is not mandatory for the CineForge web/control plane. Generation may be local or remote.

Wan 2.2 calls the official generate.py interface. ComfyUI is called through its HTTP API. Hugging Face Spaces are called through Gradio when configured. No model weights are bundled.

Run locally with Python 3.10+ and FFmpeg:

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

Open http://127.0.0.1:8000.

For provider configuration, see THIRD_PARTY_NOTICES.md and the environment variables referenced by the adapters.
