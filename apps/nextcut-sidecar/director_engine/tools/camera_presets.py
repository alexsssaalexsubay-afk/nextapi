"""运镜模板库 — 预置专业级运镜方案。

基于调研：Seedance 2.0 的运镜需要明确的提示才能避免机械感，
加入微抖动和曝光变化的描述后效果改善。
这些模板直接优化了 Seedance 2.0 的输出质量。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CameraPreset:
    id: str
    name: str
    name_zh: str
    category: str
    camera: str
    motion: str
    lens: str
    lighting: str
    composition: str
    seedance_tip: str


PRESETS: list[CameraPreset] = [
    # === 对话场景 ===
    CameraPreset(
        id="dialogue_ots",
        name="Over-the-Shoulder Dialogue",
        name_zh="过肩对话镜头",
        category="dialogue",
        camera="over-the-shoulder medium close-up",
        motion="gentle handheld micro-sway with subtle breathing rhythm",
        lens="50mm f/1.8 shallow depth of field",
        lighting="soft key light from 45 degrees, warm fill, natural eye highlights",
        composition="rule of thirds, speaking subject in clear focus, shoulder frame edge",
        seedance_tip="Add 'subtle handheld micro-movement, natural exposure shifts' to avoid mechanical feel",
    ),
    CameraPreset(
        id="dialogue_closeup",
        name="Intimate Close-Up",
        name_zh="亲密特写",
        category="dialogue",
        camera="tight close-up on face",
        motion="imperceptible slow push-in, breathing-like micro-drift",
        lens="85mm f/1.4 portrait bokeh",
        lighting="Rembrandt lighting, one side shadow, warm skin tones",
        composition="centered face, eyes on upper third line, shallow depth",
        seedance_tip="Dialogue in double quotes triggers lip-sync. Add 'natural skin texture, pore-level detail'",
    ),
    # === 动作场景 ===
    CameraPreset(
        id="action_tracking",
        name="Action Tracking Shot",
        name_zh="动作追踪镜头",
        category="action",
        camera="medium tracking shot following subject",
        motion="steady lateral tracking at subject speed, slight forward momentum",
        lens="35mm anamorphic wide",
        lighting="dynamic high-contrast, directional hard light with motion blur",
        composition="subject in left third, movement direction has headroom",
        seedance_tip="One clear action per shot. Describe physical impacts: 'dust rises from footsteps, fabric ripples with movement'",
    ),
    CameraPreset(
        id="action_lowangle",
        name="Low-Angle Power Shot",
        name_zh="仰角力量镜头",
        category="action",
        camera="low-angle dramatic upward shot",
        motion="slow dolly-in from ground level, building tension",
        lens="24mm wide-angle slight distortion",
        lighting="strong backlight rim, silhouette edge, dramatic sky",
        composition="subject dominates frame from below, environment frames edges",
        seedance_tip="First instruction wins in Seedance — put the power pose description first",
    ),
    # === 建立镜头 ===
    CameraPreset(
        id="establishing_wide",
        name="Wide Establishing Shot",
        name_zh="全景建立镜头",
        category="establishing",
        camera="extreme wide shot, full environment reveal",
        motion="slow crane rise or gentle aerial drift",
        lens="16mm ultra-wide, deep focus",
        lighting="golden hour rim light, volumetric atmosphere, natural gradient sky",
        composition="environment fills frame, small subject figure for scale",
        seedance_tip="Use @Image for environment reference. Add 'volumetric light rays, atmospheric haze' for cinematic depth",
    ),
    CameraPreset(
        id="establishing_orbit",
        name="Orbit Reveal",
        name_zh="环绕揭示镜头",
        category="establishing",
        camera="smooth orbital arc around subject, 180 degrees",
        motion="steady 180-degree orbit at eye level, constant radius",
        lens="35mm standard, moderate depth of field",
        lighting="changing light direction as camera orbits, natural shadow play",
        composition="subject centered, background shifts revealing new context",
        seedance_tip="Single camera move only. 'Smooth 180-degree orbit' — never add zoom or tilt on top",
    ),
    # === 产品展示 ===
    CameraPreset(
        id="product_hero",
        name="Product Hero Shot",
        name_zh="产品英雄镜头",
        category="product",
        camera="close-up product showcase on clean surface",
        motion="slow 45-degree orbit with gentle rise, highlighting form",
        lens="100mm macro, razor-sharp focus on product surface",
        lighting="studio three-point: bright key, soft fill, accent rim light",
        composition="centered product, clean negative space, reflection surface",
        seedance_tip="Pass product photo as image_urls[0] to lock appearance. Add material details: 'brushed aluminum texture, glass refraction'",
    ),
    # === 情感/氛围 ===
    CameraPreset(
        id="mood_slowmo",
        name="Slow Motion Mood",
        name_zh="慢动作氛围镜头",
        category="mood",
        camera="medium shot, emotional moment captured",
        motion="extremely slow dolly-in, time feels stretched",
        lens="85mm f/1.2, dreamy shallow focus",
        lighting="soft diffused backlight, lens flare edges, warm color temperature",
        composition="subject in soft focus transitioning to sharp, emotional reveal",
        seedance_tip="Describe the emotion through physical detail: 'a single tear traces down the cheek, catching light' not 'character feels sad'",
    ),
    CameraPreset(
        id="mood_timelapse",
        name="Time-Lapse Transition",
        name_zh="延时转场镜头",
        category="mood",
        camera="locked static wide shot, time passing",
        motion="locked camera position, clouds/shadows/light shift rapidly",
        lens="24mm wide-angle, deep focus everything sharp",
        lighting="transitioning from day to night or vice versa, natural light progression",
        composition="architectural or landscape frame with clear sky section for time passage",
        seedance_tip="Use timecodes: [00:00-00:03] dawn light, [00:03-00:05] full daylight. Sequential descriptions work best",
    ),
    # === 叙事过渡 ===
    CameraPreset(
        id="transition_pullback",
        name="Dramatic Pull-Back Reveal",
        name_zh="拉远揭示镜头",
        category="transition",
        camera="starting tight on detail, pulling back to reveal full scene",
        motion="steady dolly-out accelerating, from close-up to wide",
        lens="zoom from 85mm to 24mm (simulated)",
        lighting="detail lighting transitioning to environmental lighting",
        composition="starts with mystery detail, reveals context and meaning",
        seedance_tip="Structure as shot-script: [00:00-00:02] tight on detail, [00:02-00:05] pull back reveals scene",
    ),
    CameraPreset(
        id="transition_matchcut",
        name="Match Cut Transition",
        name_zh="匹配剪辑过渡",
        category="transition",
        camera="two matched compositions sharing geometric similarity",
        motion="minimal motion, relying on visual match between shapes",
        lens="consistent focal length for both sides of cut",
        lighting="matching light direction across scenes for seamless visual bridge",
        composition="geometric match: circle to circle, line to line, shape rhyme",
        seedance_tip="Describe both halves explicitly: 'spinning coin transitions to spinning planet earth, matching rotation speed and direction'",
    ),
]


def get_presets_by_category(category: str) -> list[CameraPreset]:
    return [p for p in PRESETS if p.category == category]


def get_preset(preset_id: str) -> CameraPreset | None:
    return next((p for p in PRESETS if p.id == preset_id), None)


def get_all_categories() -> list[str]:
    return list({p.category for p in PRESETS})


def get_preset_for_shot_type(shot_description: str) -> CameraPreset:
    """根据镜头描述自动匹配最佳运镜模板。"""
    desc = shot_description.lower()
    if any(w in desc for w in ["dialogue", "conversation", "talk", "speak", "对话", "说话"]):
        return PRESETS[0]
    if any(w in desc for w in ["action", "fight", "chase", "run", "动作", "追逐", "打斗"]):
        return PRESETS[2]
    if any(w in desc for w in ["establish", "opening", "environment", "landscape", "全景", "环境"]):
        return PRESETS[4]
    if any(w in desc for w in ["product", "showcase", "display", "产品", "展示"]):
        return PRESETS[6]
    if any(w in desc for w in ["emotion", "mood", "feel", "slow", "情感", "氛围"]):
        return PRESETS[7]
    if any(w in desc for w in ["transition", "reveal", "过渡", "揭示"]):
        return PRESETS[9]
    return PRESETS[4]
