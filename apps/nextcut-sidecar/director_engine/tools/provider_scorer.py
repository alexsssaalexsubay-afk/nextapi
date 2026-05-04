"""Provider Scorer — 智能选择最佳视频生成模型。

基于调研：
- Seedance 2.0: 多镜头叙事 + 音画同步 + 参考式控制 + 角色一致性
- Kling 3.0: 运动控制 + 物理精度 + 单镜头锐利 + 动作场景
- Sora 2: 电影级氛围 + 镜头语言 + 关键镜头 + 自然光影
- LTX 2.3: 本地生成 + 开源免费 + ComfyUI集成 + 两阶段放大
- Wan 2.7: 本地生成 + 小模型快速 + 中文提示

7维评分系统（参考OpenMontage）：
1. task_fit: 任务匹配度
2. quality: 输出质量
3. control: 可控性
4. reliability: 稳定性
5. cost: 成本效率
6. latency: 延迟
7. continuity: 跨镜头一致性
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ProviderScore:
    provider: str
    model: str
    total: float
    task_fit: float
    quality: float
    control: float
    reliability: float
    cost: float
    latency: float
    continuity: float
    reason: str


PROVIDER_PROFILES = {
    "seedance-2.0": {
        "strengths": ["multishot_narrative", "audio_sync", "reference_control", "character_consistency", "lip_sync", "multimodal_input"],
        "base_scores": {"quality": 0.85, "control": 0.95, "reliability": 0.85, "cost": 0.75, "latency": 0.80, "continuity": 0.90},
    },
    "kling-3.0": {
        "strengths": ["motion_control", "physics_precision", "action_scenes", "sharp_detail", "dance_choreography"],
        "base_scores": {"quality": 0.90, "control": 0.80, "reliability": 0.80, "cost": 0.70, "latency": 0.75, "continuity": 0.75},
    },
    "sora-2": {
        "strengths": ["cinematic_atmosphere", "camera_language", "hero_shot", "natural_lighting", "emotional_depth"],
        "base_scores": {"quality": 0.95, "control": 0.60, "reliability": 0.70, "cost": 0.40, "latency": 0.50, "continuity": 0.65},
    },
    "ltx-2.3": {
        "strengths": ["local_generation", "open_source", "comfyui_native", "two_stage_upscale", "fast_iteration"],
        "base_scores": {"quality": 0.70, "control": 0.75, "reliability": 0.90, "cost": 0.95, "latency": 0.85, "continuity": 0.60},
    },
    "wan-2.7": {
        "strengths": ["local_generation", "small_model", "chinese_prompt", "fast_draft"],
        "base_scores": {"quality": 0.60, "control": 0.65, "reliability": 0.85, "cost": 0.95, "latency": 0.90, "continuity": 0.55},
    },
}

TASK_BOOST = {
    "multishot_narrative": {"seedance-2.0": 0.20, "kling-3.0": -0.05, "sora-2": -0.10},
    "audio_sync": {"seedance-2.0": 0.25},
    "lip_sync": {"seedance-2.0": 0.25},
    "action_scene": {"kling-3.0": 0.20, "seedance-2.0": 0.05},
    "hero_shot": {"sora-2": 0.25, "seedance-2.0": 0.05},
    "product_showcase": {"kling-3.0": 0.15, "seedance-2.0": 0.10},
    "character_consistency": {"seedance-2.0": 0.15},
    "local_only": {"ltx-2.3": 0.30, "wan-2.7": 0.25},
    "budget_constrained": {"ltx-2.3": 0.20, "wan-2.7": 0.20, "seedance-2.0": 0.05},
    "fast_draft": {"wan-2.7": 0.15, "ltx-2.3": 0.10, "kling-3.0": 0.10},
}


def score_providers(
    task_type: str = "general",
    needs_audio: bool = False,
    needs_lip_sync: bool = False,
    shot_count: int = 1,
    local_only: bool = False,
    budget_constrained: bool = False,
    available_providers: list[str] | None = None,
) -> list[ProviderScore]:
    """对所有可用provider进行7维打分，返回排序后的推荐列表。"""
    if available_providers is None:
        available_providers = list(PROVIDER_PROFILES.keys())

    tasks = [task_type]
    if needs_audio:
        tasks.append("audio_sync")
    if needs_lip_sync:
        tasks.append("lip_sync")
    if shot_count > 1:
        tasks.append("multishot_narrative")
    if local_only:
        tasks.append("local_only")
    if budget_constrained:
        tasks.append("budget_constrained")

    scores: list[ProviderScore] = []
    for provider_id in available_providers:
        if provider_id not in PROVIDER_PROFILES:
            continue
        profile = PROVIDER_PROFILES[provider_id]
        base = profile["base_scores"]

        task_fit = 0.5
        for task in tasks:
            task_fit += TASK_BOOST.get(task, {}).get(provider_id, 0.0)
        task_fit = max(0.0, min(1.0, task_fit))

        continuity = base["continuity"]
        if shot_count > 3:
            continuity += 0.1 if "character_consistency" in profile["strengths"] else -0.05
        continuity = max(0.0, min(1.0, continuity))

        weights = {"task_fit": 0.25, "quality": 0.20, "control": 0.15, "reliability": 0.10, "cost": 0.10, "latency": 0.10, "continuity": 0.10}
        total = (
            weights["task_fit"] * task_fit
            + weights["quality"] * base["quality"]
            + weights["control"] * base["control"]
            + weights["reliability"] * base["reliability"]
            + weights["cost"] * base["cost"]
            + weights["latency"] * base["latency"]
            + weights["continuity"] * continuity
        )

        reason_parts = []
        if task_fit > 0.7:
            reason_parts.append("high task fit")
        for s in profile["strengths"][:3]:
            if any(s in t for t in tasks):
                reason_parts.append(s.replace("_", " "))
        reason = ", ".join(reason_parts) if reason_parts else "general purpose"

        scores.append(ProviderScore(
            provider=provider_id,
            model=provider_id,
            total=round(total, 3),
            task_fit=round(task_fit, 3),
            quality=base["quality"],
            control=base["control"],
            reliability=base["reliability"],
            cost=base["cost"],
            latency=base["latency"],
            continuity=round(continuity, 3),
            reason=reason,
        ))

    scores.sort(key=lambda s: s.total, reverse=True)
    return scores
