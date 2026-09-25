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

## Integration rule

CineForge does **not** replace, rewrite, or retrain these upstream projects. The project is intended to preserve their upstream implementations and licenses while using them as the generation/production building blocks.

Long-form films are produced as many shots/scenes and then assembled; a single model inference is not treated as a multi-hour movie generator.

## GitHub publication

This project is published in the cineforge-ltx-studio branch of:

https://github.com/physiorelieflabs-blip/Lunavo/tree/cineforge-ltx-studio

The repository is the source-control home for the CineForge integration work. Model weights are not included.

## Licensing

Each upstream project keeps its own license and terms. In particular, KupkaProd has separate commercial licensing terms, and LTX-2 has its own LTX-2 Community License Agreement. Do not redistribute upstream code, weights, or commercial use rights as though they were covered by one common license.

## Current scope

This publication records the selected upstream stack and integration direction without introducing a new, rewritten video-generation implementation.
