"""Offline smoke for the Director production contract.

Run from the repository root:
  PYTHONPATH=apps/nextcut-sidecar python3 apps/nextcut-sidecar/director_engine/tools/demo_novel_pipeline.py

This intentionally does not call any LLM or video provider. It proves the
deterministic layer that turns a story/shot into an editable generation card.
"""

from __future__ import annotations

import json

from director_engine.interfaces.models import (
    CameraLanguage,
    Character,
    DirectorScene,
    DirectorShot,
    ReferenceAsset,
    ShotDecomposition,
    VideoGenerationParams,
)
from director_engine.tools.production_bible import (
    build_production_bible,
    build_shot_generation_card,
    prompt_review_summary,
    review_generation_prompt,
)


def main() -> None:
    scene = DirectorScene(
        id="scene-1",
        index=1,
        title="雨夜天台",
        description="雨夜城市天台，冷蓝霓虹和远处红色警灯交替扫过，地面有积水反光。",
        characters=["林遥"],
    )
    character = Character(
        name="林遥",
        appearance="二十七岁，黑色短发，深灰风衣，左眉有细小疤痕。",
        personality="克制、警觉、行动迅速。",
        voice="低声、短句、呼吸略急。",
        reference_images=["asset://ut-asset-reference-portrait"],
    )
    shot = DirectorShot(
        id="shot-1",
        scene_id="scene-1",
        index=1,
        title="发现信号",
        duration=5,
        aspect_ratio="16:9",
        prompt=(
            "林遥站在雨夜天台边缘，右手按住耳机，慢慢抬头看向远处闪烁的红色警灯，"
            "雨水沿着风衣肩线滑落，镜头从中近景缓慢推近，保持清晰面部和稳定动作。"
        ),
        camera=CameraLanguage(
            camera="medium close shot",
            motion="slow push-in",
            lighting="cold blue neon with red police light sweeps",
            lens="50mm cinematic lens",
        ),
        decomposition=ShotDecomposition(
            visual_desc="雨夜天台上的角色发现远处信号。",
            motion_desc="角色按住耳机，慢慢抬头并凝视远处红色警灯。",
            audio_desc="雨声、低频城市噪声、耳机中短促电流声。",
        ),
        references=[
            ReferenceAsset(
                url="asset://ut-asset-reference-portrait",
                type="image",
                role="reference_image",
                description="林遥授权肖像资产",
            )
        ],
        generation_params=VideoGenerationParams(
            model="seedance-2.0-pro",
            duration=5,
            quality="720p",
            aspect_ratio="16:9",
            image_urls=["asset://ut-asset-reference-portrait"],
            reference_instructions=["Use image 1 as the identity anchor for 林遥."],
        ),
    )

    bible = build_production_bible(
        title="雨夜信号",
        style="cinematic realistic short drama",
        aspect_ratio="16:9",
        duration=5,
        scenes=[scene],
        characters=[character],
        references=shot.references,
    )
    card = build_shot_generation_card(shot, bible)
    findings = review_generation_prompt(shot)

    print(
        json.dumps(
            {
                "production_bible": bible.model_dump(),
                "shot_generation_card": card.model_dump(),
                "prompt_review": prompt_review_summary(findings),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
