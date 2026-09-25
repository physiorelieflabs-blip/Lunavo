# CineForge Portability

## Goal

GPU is an accelerator, not a prerequisite for the CineForge studio layer.

## Execution choices

| Mode | Local GPU required? | Purpose |
|---|---:|---|
| CPU local | No | Run CPU-capable upstream workflows; expect much slower video generation |
| GPU local | Yes | Fastest local path when compatible CUDA hardware is available |
| Low-VRAM / offload | Usually | Keep weights or selected components in CPU RAM/disk to reduce VRAM demand |
| Remote generation | No | Browser/PC stays lightweight while a remote machine performs model inference |

## Upstream support

ComfyUI officially exposes `--cpu` for CPU-only execution, plus low-VRAM and no-VRAM modes. https://github.com/Comfy-Org/ComfyUI

LTX-2 officially exposes `--offload cpu` and `--offload disk`, reducing GPU memory requirements. https://github.com/Lightricks/LTX-2

Wan 2.2 exposes CPU offloading controls such as `--offload_model` and `--t5_cpu`, but its official implementation remains GPU-oriented. https://github.com/Wan-Video/Wan2.2

HunyuanVideo 1.5 currently documents NVIDIA CUDA hardware as a requirement, so it remains a GPU/remote option rather than a guaranteed CPU-only engine. https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5

## Design rule

The CineForge UI/orchestrator should never fail merely because CUDA is missing. Model selection should be based on the available execution backend:

- CPU available -> select a CPU-compatible upstream workflow.
- NVIDIA GPU available -> select the appropriate local GPU workflow.
- Neither practical locally -> select a configured remote execution backend.

No custom video-generation model is introduced by this portability layer; it uses existing upstream projects.

## Honest limitation

CPU compatibility means the studio can operate without a dedicated GPU. It does not mean that every modern video model will generate quickly or fit into ordinary system RAM. The actual model backend determines practical hardware requirements.