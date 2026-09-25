# CineForge Studio

**Made by LN**

CineForge is the movie-studio layer for combining established local/open-source video-generation projects into one long-form filmmaking workflow.

## Selected upstream stack

- **Wan 2.2** — primary video generation engine
  - https://github.com/Wan-Video/Wan2.2
- **KupkaProd Cinema Pipeline** — production/orchestration reference
  - https://github.com/vladimirvalcourt/kupkaprod-cinema-pipeline
- **HunyuanVideo 1.5** — alternate video engine
  - https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5
- **LTX-2** — alternate synchronized audio/video engine
  - https://github.com/Lightricks/LTX-2
- **ComfyUI** — optional execution/runtime layer
  - https://github.com/Comfy-Org/ComfyUI

## GPU is optional for CineForge

CineForge is intended to be usable from machines that do not have a dedicated GPU. The studio/orchestration layer must not refuse to start just because CUDA is unavailable.

Execution modes:

1. **GPU local** — use a compatible local model/runtime when CUDA hardware is available.
2. **CPU local** — use CPU-capable ComfyUI workflows or other upstream CPU-compatible paths. ComfyUI provides an official `--cpu` mode, although modern video models can be extremely slow on CPU. https://github.com/Comfy-Org/ComfyUI
3. **Low-VRAM/offload local** — use upstream CPU/disk offloading where the selected model supports it. LTX-2 exposes CPU and disk offload modes; Wan 2.2 exposes model/T5 CPU offloading. https://github.com/Lightricks/LTX-2 https://github.com/Wan-Video/Wan2.2
4. **Remote execution** — the browser/studio can be separated from the generation machine so the user's computer does not need the GPU. A remote compatible ComfyUI/model server can perform the generation while CineForge handles the project, scenes, continuity, review, and assembly.

## Important model limitation

"GPU optional" does not mean every upstream model can perform fast, full-quality inference on every CPU. The official HunyuanVideo 1.5 documentation lists NVIDIA CUDA hardware as a system requirement, and Wan 2.2 is likewise built around GPU inference with CPU offloading used to reduce GPU memory. LTX-2 supports CPU/disk weight offloading but is also optimized around GPU execution.

The portability goal is therefore: **CineForge can run anywhere; generation automatically uses the best available execution path.**

## Long-form movies

Long-form films are produced as many shots/scenes and then assembled; a single model inference is not treated as a multi-hour movie generator.

## GitHub publication

This project is published in the `main` branch of:

https://github.com/physiorelieflabs-blip/Lunavo/tree/main/CineForge_LTX_Studio

The repository is the source-control home for the CineForge integration work. Model weights are not included.

## Licensing

Each upstream project keeps its own license and terms. In particular, KupkaProd has separate commercial licensing terms, and LTX-2 has its own LTX-2 Community License Agreement. Do not redistribute upstream code, weights, or commercial use rights as though they were covered by one common license.

## Current scope

This publication records the selected upstream stack and portability strategy without introducing a new, rewritten video-generation implementation.
