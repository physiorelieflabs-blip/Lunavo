# CineForge LTX Studio

A local-first AI filmmaking studio combining KupkaProd-style movie orchestration with the official LTX-2.3 local generation pipeline.

## Pipeline

Prompt / screenplay -> scene planning -> continuity anchors -> self-contained LTX-2.3 shot prompts -> local generation -> FFmpeg stitching -> final movie.

The application does not pretend that one model call creates a multi-hour movie. Long-form output is assembled from many scene/shot generations.

## Run

1. Install Python 3.10+ and FFmpeg.
2. Install this project's requirements.
3. Install the official LTX-2 repository separately and its LTX-2.3 model assets.
4. Configure CINEFORGE_LTX_REPO, CINEFORGE_LTX_PYTHON, CINEFORGE_LTX_CHECKPOINT, CINEFORGE_LTX_GEMMA and CINEFORGE_LTX_UPSCALER.
5. Start the FastAPI app with uvicorn backend.main:app --host 127.0.0.1 --port 8000.
6. Open the web UI.

The UI footer says Made by LN.

## Important license note

This project is an integration layer. KupkaProd and LTX-2.3 have separate license terms. Keep their original licenses and model terms with any redistribution. Model weights are not included here.
