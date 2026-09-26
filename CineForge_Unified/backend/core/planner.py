from __future__ import annotations

import math

from .models import ContinuationMode, ContinuityState, FilmProject, Shot


def build_project(
    title: str,
    brief: str,
    duration_seconds: int,
    shot_seconds: float,
    style: str,
) -> FilmProject:
    count = max(1, math.ceil(duration_seconds / shot_seconds))
    shots: list[Shot] = []

    for idx in range(count):
        start = idx * shot_seconds
        remaining = max(0.1, duration_seconds - start)
        length = min(shot_seconds, remaining)

        previous = shots[-1].continuity_out if shots else ContinuityState()
        prompt = (
            f"{style}. {brief}. "
            f"Shot {idx + 1} of {count}. "
            "Preserve every identity, wardrobe, prop, location, lighting and "
            "camera continuity from the previous shot. "
            f"Previous state: {previous.model_dump_json()}. "
            "Create a natural handoff into the next shot."
        )
        outgoing = ContinuityState(
            characters=previous.characters,
            wardrobe=previous.wardrobe,
            props=previous.props,
            location=previous.location,
            lighting=previous.lighting,
            camera=previous.camera,
            action=f"End state of shot {idx + 1}",
            audio="Carry ambient bed and dialogue context forward",
            handoff=f"Boundary state after shot {idx + 1}",
        )
        shots.append(
            Shot(
                index=idx,
                duration_seconds=round(length, 2),
                prompt=prompt,
                continuity_in=previous,
                continuity_out=outgoing,
                continuation_mode=(
                    ContinuationMode.EXTEND if idx else ContinuationMode.QUALITY
                ),
            )
        )

    return FilmProject(
        title=title,
        brief=brief,
        duration_seconds=duration_seconds,
        shot_seconds=shot_seconds,
        style=style,
        shots=shots,
    )
