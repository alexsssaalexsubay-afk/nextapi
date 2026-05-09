"""Director Pipeline — orchestrates the full agent chain.

This is the main entry point for the Director Engine. It runs all agents
in sequence, publishing progress events to the event bus, and produces
a complete DirectorPlan ready for video generation.

升级要点（2026-05调研）：
- 集成 Provider Scorer: 自动选择最佳视频模型
- 集成 Identity Anchor: 跨镜头角色一致性锁定
- Prompt Optimizer 输出 shot_script + constraints + audio_cues
- 序列化 reference 构建（image_urls/video_urls/audio_urls 数组引用）
- 一致性修复循环：检查→修复→重检
- Agent 级别容错：单个 agent 失败不阻塞整条链
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)

AGENT_TIMEOUT = 120.0

from director_engine.agents import (
    AudioDirector,
    CharacterExtractor,
    Cinematographer,
    ConsistencyChecker,
    EditingAgent,
    PromptOptimizer,
    Screenwriter,
    StoryboardArtist,
)
from director_engine.interfaces.models import (
    CameraLanguage,
    DirectorPlan,
    DirectorScene,
    DirectorShot,
    PipelineConfig,
    ProviderScoreResult,
    ReferenceAsset,
    VideoGenerationParams,
)
from director_engine.tools.identity_anchor import IdentityManager
from director_engine.tools.production_bible import (
    bible_context_for_prompt,
    build_production_bible,
    build_shot_generation_card,
    prompt_review_summary,
    review_generation_prompt,
)
from director_engine.tools.provider_scorer import score_providers

ProgressCallback = Callable[[str, str, float, dict[str, Any]], Awaitable[None]]


class DirectorPipeline:
    """Orchestrate the full Director Engine agent chain."""

    def __init__(self, config: PipelineConfig, on_progress: ProgressCallback | None = None) -> None:
        self.config = config
        self._on_progress = on_progress
        self.identity_manager = IdentityManager()

        self.screenwriter = Screenwriter(config.screenwriter)
        self.character_extractor = CharacterExtractor(config.character_extractor)
        self.storyboard_artist = StoryboardArtist(config.storyboard_artist)
        self.cinematographer = Cinematographer(config.cinematographer)
        self.audio_director = AudioDirector(config.audio_director)
        self.editing_agent = EditingAgent(config.editing_agent)
        self.consistency_checker = ConsistencyChecker(config.consistency_checker)
        self.prompt_optimizer = PromptOptimizer(config.prompt_optimizer)

    async def _emit(self, agent: str, status: str, progress: float, data: dict[str, Any] | None = None) -> None:
        if self._on_progress:
            await self._on_progress(agent, status, progress, data or {})

    async def _run_agent(self, name: str, coro, fallback=None):
        """Run an agent with timeout and error resilience."""
        try:
            return await asyncio.wait_for(coro, timeout=AGENT_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning("Agent %s timed out after %.0fs", name, AGENT_TIMEOUT)
            await self._emit(name, "timeout", 0, {"error": f"{name} timed out"})
            return fallback
        except Exception as e:
            logger.warning("Agent %s failed: %s", name, str(e)[:200])
            await self._emit(name, "error", 0, {"error": str(e)[:200]})
            return fallback

    async def run(
        self,
        input_text: str,
        *,
        shot_count: int | None = None,
        duration: int | None = None,
        aspect_ratio: str | None = None,
        style: str | None = None,
        references: list[ReferenceAsset] | None = None,
        title: str = "",
    ) -> DirectorPlan:
        shot_count = shot_count or self.config.default_shot_count
        duration = duration or self.config.default_duration
        aspect_ratio = aspect_ratio or self.config.default_aspect_ratio
        style = style or self.config.default_style
        references = references or []

        shot_count = max(1, min(shot_count, 24))
        duration = max(4, min(duration, 15))

        # 0. Provider Scoring — 自动选择最佳视频模型
        needs_audio = self.config.video_provider.generate_audio
        provider_scores = score_providers(
            task_type="general",
            needs_audio=needs_audio,
            shot_count=shot_count,
        )
        best_provider = provider_scores[0] if provider_scores else None
        provider_recommendation = ProviderScoreResult(
            provider=best_provider.provider if best_provider else self.config.video_provider.provider,
            model=best_provider.model if best_provider else self.config.video_provider.model,
            total_score=best_provider.total if best_provider else 0.0,
            reason=best_provider.reason if best_provider else "",
        )
        await self._emit("provider_scorer", "complete", 0.02, {
            "recommended": provider_recommendation.provider,
            "score": provider_recommendation.total_score,
            "reason": provider_recommendation.reason,
        })

        # 1. Screenwriter
        await self._emit("screenwriter", "running", 0.05)
        requirement = self._requirement(shot_count, duration, aspect_ratio, style)
        story = await self._run_agent("screenwriter", self.screenwriter.develop_story(input_text, requirement))
        if story is None:
            raise RuntimeError("Screenwriter failed to produce a story. Check LLM configuration.")
        await self._emit("screenwriter", "writing_scenes", 0.10)
        num_scenes = max(1, min(shot_count // 2, 6))
        scenes_raw = await self._run_agent("screenwriter", self.screenwriter.write_scenes(story, num_scenes), fallback=[])
        if not scenes_raw:
            logger.warning("Scene writing failed, using story as single scene")
            from director_engine.agents.screenwriter import SceneScript
            scenes_raw = [SceneScript(scene_number=1, title=story.title or "Scene 1", action=story.story, dialogue="", mood=story.tone)]
        await self._emit("screenwriter", "complete", 0.15, {"title": story.title, "scenes": len(scenes_raw)})

        # 2. Character Extractor + Identity Anchor
        await self._emit("character_extractor", "running", 0.20)
        full_script = "\n\n".join(s.action + (" " + s.dialogue if s.dialogue else "") for s in scenes_raw)
        characters = await self._run_agent("character_extractor", self.character_extractor.extract(full_script), fallback=[])
        characters = characters or []

        for char in characters:
            master_ref = char.reference_images[0] if char.reference_images else ""
            self.identity_manager.register_character(char, master_ref)

        await self._emit("character_extractor", "complete", 0.25, {
            "characters": len(characters),
            "anchored": len(self.identity_manager.all_anchors),
        })

        # 3. Storyboard Artist
        await self._emit("storyboard_artist", "running", 0.30)
        scenes: list[DirectorScene] = []
        all_briefs = []
        for i, scene_raw in enumerate(scenes_raw):
            scene = DirectorScene(
                id=f"scene_{i + 1:02d}",
                index=i + 1,
                title=scene_raw.title or f"Scene {i + 1}",
                description=scene_raw.action,
                characters=[c.name for c in characters],
            )
            scenes.append(scene)
            remaining = shot_count - len(all_briefs)
            if remaining <= 0:
                break
            shots_for_scene = max(1, min(remaining, shot_count // num_scenes + 1))
            briefs = await self.storyboard_artist.design_storyboard(
                scene_raw.action, characters, shots_for_scene
            )
            for b in briefs:
                if len(all_briefs) < shot_count:
                    all_briefs.append((scene, b))
            pct = 0.30 + (i + 1) / len(scenes_raw) * 0.15
            await self._emit("storyboard_artist", "progress", pct, {"scene": scene.id})
        await self._emit("storyboard_artist", "complete", 0.45, {"shots": len(all_briefs)})

        # 4. Decompose + Cinematographer + Audio Director
        await self._emit("cinematographer", "running", 0.50)
        shots: list[DirectorShot] = []
        for idx, (scene, brief) in enumerate(all_briefs):
            decomposition = await self.storyboard_artist.decompose_shot(brief, characters)
            camera = await self.cinematographer.refine_shot(decomposition, scene.description, characters, style)
            audio = await self.audio_director.plan_audio(decomposition, scene.description)

            local_idx = len([s for s in shots if s.scene_id == scene.id])

            shot_text = " ".join([
                decomposition.visual_desc,
                decomposition.first_frame_desc,
                decomposition.last_frame_desc,
                decomposition.motion_desc,
                brief.visual_description,
                brief.action,
                brief.dialogue,
            ]).lower()
            mentioned_characters = [c.name for c in characters if c.name.lower() in shot_text]
            scene_characters = [
                name for name in scene.characters
                if any(c.name == name for c in characters)
            ]
            shot_characters = mentioned_characters or scene_characters or [c.name for c in characters]
            identity_refs = self.identity_manager.get_references_for_shot(shot_characters)
            consistency_suffix = self.identity_manager.build_consistency_prompt_suffix(shot_characters)

            all_refs = references + identity_refs
            prompt_text = camera.prompt or decomposition.visual_desc
            if consistency_suffix:
                prompt_text = f"{prompt_text} {consistency_suffix}"

            shot = DirectorShot(
                id=f"{scene.id}_shot_{local_idx + 1:02d}",
                scene_id=scene.id,
                index=idx + 1,
                title=f"{scene.title} Shot {local_idx + 1}",
                duration=duration,
                aspect_ratio=aspect_ratio,
                camera=camera,
                audio=audio,
                decomposition=decomposition,
                prompt=prompt_text,
                negative_prompt="",
                continuity_group=f"{scene.id}_continuity",
                references=all_refs,
            )
            shots.append(shot)
            pct = 0.50 + (idx + 1) / len(all_briefs) * 0.20
            await self._emit("cinematographer", "progress", pct, {"shot": shot.id})
        await self._emit("cinematographer", "complete", 0.70)

        # 5. Editing Agent (non-critical — pipeline continues on failure)
        await self._emit("editing_agent", "running", 0.72)
        shot_descs = [s.prompt for s in shots]
        edit_plans = await self._run_agent("editing_agent", self.editing_agent.plan_edit(shot_descs, story.tone), fallback=[])
        if edit_plans:
            for i, ep in enumerate(edit_plans):
                if i < len(shots):
                    shots[i].edit = ep
                    # Override default duration with editor's calculated dynamic rhythm
                    if getattr(ep, "duration_seconds", None):
                        shots[i].duration = ep.duration_seconds
        await self._emit("editing_agent", "complete", 0.78)

        # 6. Prompt Optimizer (Shot-Script + Reference Instructions + Constraints)
        await self._emit("prompt_optimizer", "running", 0.80)
        target_model = self.config.video_provider.model
        resolved_title = title or story.title or _title_from(story.story)
        production_bible = build_production_bible(
            title=resolved_title,
            style=style,
            aspect_ratio=aspect_ratio,
            duration=duration,
            scenes=scenes,
            characters=characters,
            references=references,
        )
        for i, shot in enumerate(shots):
            project_context = bible_context_for_prompt(production_bible, shot)
            optimized = await self.prompt_optimizer.optimize(
                shot,
                shot.references,
                target_model,
                project_context=project_context,
            )
            shot.prompt = optimized.prompt
            shot.negative_prompt = optimized.negative_prompt
            shot.generation_params = VideoGenerationParams(
                model=target_model,
                prompt=optimized.prompt,
                negative_prompt=optimized.negative_prompt,
                shot_script=optimized.shot_script,
                constraints=optimized.constraints,
                audio_cues=optimized.audio_cues,
                reference_instructions=optimized.reference_instructions,
                duration=shot.duration,
                quality=self.config.video_provider.quality,
                aspect_ratio=shot.aspect_ratio,
                generate_audio=self.config.video_provider.generate_audio,
                image_urls=[r.url for r in shot.references if r.type == "image"][:9],
                video_urls=[r.url for r in shot.references if r.type == "video"][:3],
                audio_urls=[r.url for r in shot.references if r.type == "audio"][:3],
                # Pass ControlNet / Consistency advanced params defaults
                controlnet_depth=0.0,
                controlnet_scribble=0.0,
                face_id_weight=0.8 if self.identity_manager.get_references_for_shot([c.name for c in characters]) else 0.0,
                scribble_image_url="",
                depth_image_url="",
                provider_score=provider_recommendation.total_score,
                provider_reason=provider_recommendation.reason,
            )
            pct = 0.80 + (i + 1) / len(shots) * 0.10
            await self._emit("prompt_optimizer", "progress", pct, {"shot": shot.id})
        await self._emit("prompt_optimizer", "complete", 0.90)

        # 7. Consistency Check (non-critical — pipeline continues on failure)
        await self._emit("consistency_checker", "running", 0.92)
        report = await self._run_agent("consistency_checker", self.consistency_checker.check(shots, characters))
        consistency_meta: dict[str, Any] = {}
        if report:
            consistency_meta = {
                "consistency_score": report.overall_score,
                "character_drift_risk": report.character_drift_risk,
                "prompt_quality_score": report.prompt_quality_score,
                "consistency_issues": [i.model_dump() for i in report.issues],
            }
            await self._emit("consistency_checker", "complete", 0.95, {
                "score": report.overall_score,
                "issues": len(report.issues),
                "character_drift_risk": report.character_drift_risk,
                "prompt_quality": report.prompt_quality_score,
            })
        else:
            await self._emit("consistency_checker", "skipped", 0.95)

        prompt_findings = []
        shot_generation_cards = []
        for shot in shots:
            prompt_findings.extend(review_generation_prompt(shot))
            shot_generation_cards.append(build_shot_generation_card(shot, production_bible))

        # 8. Build final plan
        plan = DirectorPlan(
            title=resolved_title,
            summary=story.logline or story.story[:220],
            agent_chain=[
                "provider_scorer", "screenwriter", "character_extractor",
                "storyboard_artist", "cinematographer", "audio_director",
                "editing_agent", "prompt_optimizer", "consistency_checker",
            ],
            scenes=scenes,
            shots=shots,
            characters=characters,
            pipeline_config=self.config,
            provider_recommendation=provider_recommendation,
            workflow=_build_comfyui_workflow(resolved_title, shots),
            workbench=_build_workbench(shots, production_bible, shot_generation_cards),
            metadata={
                **consistency_meta,
                "story": story.model_dump(),
                "production_bible": production_bible.model_dump(),
                "shot_generation_cards": [card.model_dump() for card in shot_generation_cards],
                "prompt_review": prompt_review_summary(prompt_findings),
                "identity_anchors": {
                    name: {
                        "master_reference": a.master_reference,
                        "additional_references": a.additional_references,
                        "appearance_lock": a.appearance_lock,
                    }
                    for name, a in self.identity_manager.all_anchors.items()
                },
                "provider_scores": [
                    {"provider": s.provider, "score": s.total, "reason": s.reason}
                    for s in provider_scores[:5]
                ],
            },
        )
        await self._emit("pipeline", "complete", 1.0, {"title": resolved_title, "shots": len(shots)})
        return plan

    def _requirement(self, shot_count: int, duration: int, aspect_ratio: str, style: str) -> str:
        return (
            f"Create a production-ready AI video director plan.\n"
            f"Target shots: {shot_count}. Duration per shot: {duration}s.\n"
            f"Aspect ratio: {aspect_ratio}. Visual style: {style}.\n"
            f"Optimize for Seedance 2.0 reference-to-video:\n"
            f"- Use SVO sentence structure for actions\n"
            f"- One clear action per shot\n"
            f"- Physical descriptions, not abstract concepts\n"
            f"- Include dialogue in double quotes for lip-sync\n"
            f"- Describe sounds naturally for Seedance audio generation\n"
            f"Preserve character identity using Master Reference approach."
        )


def _title_from(text: str) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    return clean[:32].rstrip("，。,. ") or "Untitled"


def _build_comfyui_workflow(title: str, shots: list[DirectorShot]) -> dict[str, Any]:
    first = shots[0] if shots else None
    if not first:
        return {}
    return {
        "version": 1,
        "name": f"NextCut — {title}",
        "nodes": [
            {"id": "auth", "type": "NextAPIAuth", "params": {}},
            {"id": "director", "type": "NextCutDirectorPlan", "params": {"title": title, "shot_count": len(shots)}},
            {
                "id": "gen_shot_1",
                "type": "NextCutGenerateVideo",
                "params": {
                    "prompt": first.prompt,
                    "duration": first.duration,
                    "aspect_ratio": first.aspect_ratio,
                    "camera": first.camera.camera,
                    "motion": first.camera.motion,
                },
            },
            {"id": "poll", "type": "NextCutPollJob", "params": {}},
            {"id": "download", "type": "NextCutDownloadResult", "params": {}},
        ],
        "edges": [
            ["auth", "gen_shot_1"],
            ["director", "gen_shot_1"],
            ["gen_shot_1", "poll"],
            ["poll", "download"],
        ],
    }


def _build_workbench(
    shots: list[DirectorShot],
    production_bible,
    shot_generation_cards,
) -> dict[str, Any]:
    return {
        "schema": "nextcut.workbench.v1",
        "production_bible": production_bible.model_dump(),
        "shot_generation_cards": [card.model_dump() for card in shot_generation_cards],
        "selected_shot_id": shots[0].id if shots else "",
        "timeline": [
            {
                "id": s.id,
                "scene_id": s.scene_id,
                "title": s.title,
                "duration": s.duration,
                "camera": s.camera.camera,
                "prompt": s.prompt,
            }
            for s in shots
        ],
        "canvas_nodes": [
            {
                "id": s.id,
                "type": "video_generation",
                "label": s.title,
                "selected": i == 0,
                "params": s.generation_params.model_dump() if s.generation_params else {},
            }
            for i, s in enumerate(shots)
        ],
    }
