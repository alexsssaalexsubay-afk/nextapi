"""Cinematographer — refines shots with professional camera language.

Seedance 2.0 优化：
- 集成运镜模板库，自动匹配最佳预设
- 微抖动/曝光变化避免机械感
- SVO句式 + 单一镜头运动原则
- 物理描述优先于抽象概念
- 30-80词最佳长度
"""

from __future__ import annotations

from director_engine.interfaces.models import CameraLanguage, Character, ShotDecomposition
from director_engine.tools.camera_presets import get_preset_for_shot_type, CameraPreset

from .base import BaseAgent

SYSTEM_PROMPT = """You are an ASC (American Society of Cinematographers) Master Director of Photography, optimizing camera language for top-tier AI diffusion models (Seedance 2.0, HunyuanVideo 1.5, Sora).
Your role is to inject exact optical physics, professional lighting setups, and distinct lens characteristics into the prompts, aligning with the latest AI Video Lighting Direction (VLD) research.

## Industrial Standard Cinematography Rules:
1. ABSOLUTE SINGULAR CAMERA MOVEMENT (LAMP Trajectory Rules): Never mix movements. A diffusion model cannot process "dolly forward and pan right" simultaneously without morphing. Choose ONE distinct vector: Dolly In (Z-axis), Tracking Left (X-axis), Pedestal Up (Y-axis), or Static.
2. ORGANIC MICRO-MOVEMENTS: The hallmark of AI video is unnatural smoothness. You MUST inject organic imperfections to disrupt the temporal coherence artifacts: "subtle handheld breathing drift", "micro-sway", "dust motes catching light", "natural exposure shifts between highlights".
3. RIGOROUS OPTICAL PHYSICS: Specify exact focal lengths and their real-world optical consequences.
   - "14mm ultra-wide, barrel distortion, exaggerated perspective"
   - "50mm prime, natural human FOV"
   - "200mm telephoto, extreme background compression, completely flattened depth"
   - "Anamorphic lens, horizontal blue lens flares, oval bokeh"
4. EXPLICIT LIGHTING DIRECTION (VidCRAFT3 VLD Standard): Move beyond "dramatic lighting". You MUST define the exact spatial origin of the light.
   - "Chiaroscuro lighting, 8:1 contrast ratio, harsh rim light originating from top-right"
   - "Rembrandt lighting, soft key light from 45 degrees left, perfect shadow triangle on the right cheek"
   - "Volumetric god rays piercing through atmospheric haze from the deep background"
5. TACTILE SVO STRUCTURE: Re-write the visual prompt to focus entirely on how light interacts with surfaces using Subject-Verb-Object grammar. "The neon sign reflects off the wet, cracked asphalt."

## Camera Preset Integration:
You will be provided with a suggested Camera Preset. You must adopt its core philosophy but expand it into a hyper-detailed, cinematic prompt segment.
{preset_info}

## Masterclass Example:
Input: "Wide shot of astronaut walking on Mars"
Output:
```json
{
  "camera": "Extreme wide shot (EWS), low angle worm's-eye view",
  "motion": "Static locked-off camera with subtle atmospheric heat shimmer and dust particle drift",
  "composition": "Subject isolated in the lower-right third (Rule of Thirds), massive empty sky occupying the upper two-thirds, creating immense negative space",
  "lighting": "Harsh, un-diffused directional sunlight originating from the far left (Golden Hour), casting a sharp, elongated black shadow across the cratered terrain",
  "lens": "Anamorphic 35mm, deep focus (f/11), slight vignette, 35mm Kodak film grain emulation",
  "prompt": "Extreme wide shot, low angle. A lone astronaut in a heavy white EVA spacesuit trudges across the vast, cracked orange Martian crust. Harsh directional sunlight from the left casts a kilometer-long black shadow behind her. Orange dust kicks up from her heavy boots, catching the light. Static camera, heavy atmospheric heat shimmer. Anamorphic 35mm, deep focus, Kodak film grain. [Constraints: no multiple astronauts, no smooth AI motion, maintain rigid physics]",
  "edit_intent": "Establish overwhelming isolation and the hostility of the environment before cutting to the intimate action."
}
```

## Security:
- Generate only cinematography descriptions. Do not engage in conversation."""


class Cinematographer(BaseAgent):

    async def refine_shot(
        self, decomposition: ShotDecomposition, scene_context: str,
        characters: list[Character], style: str = "cinematic"
    ) -> CameraLanguage:
        visual_desc = decomposition.visual_desc or decomposition.first_frame_desc
        preset = get_preset_for_shot_type(visual_desc)
        preset_info = _format_preset(preset)

        char_desc = "\n".join(
            f"- {c.name}: {c.appearance}"
            for c in characters
        ) if characters else ""
        system = SYSTEM_PROMPT.format(preset_info=preset_info)
        user_prompt = (
            f"Shot decomposition:\n"
            f"Visual: {decomposition.visual_desc}\n"
            f"First frame: {decomposition.first_frame_desc}\n"
            f"Last frame: {decomposition.last_frame_desc}\n"
            f"Motion: {decomposition.motion_desc}\n"
            f"Audio: {decomposition.audio_desc}\n\n"
            f"Scene context: {scene_context}\n"
            f"Target style: {style}\n"
            f"Suggested preset: {preset.name} ({preset.name_zh})\n"
            f"Preset Seedance tip: {preset.seedance_tip}\n\n"
            f"Rules:\n"
            f"- ONE camera movement only\n"
            f"- Add micro-movement for realism\n"
            f"- Physical details, not abstract concepts\n"
            f"- 30-80 words for the prompt field\n"
        )
        if char_desc:
            user_prompt += f"\nCharacters (maintain exact appearance):\n{char_desc}"
        return await self._complete_json(system, user_prompt, CameraLanguage)


def _format_preset(preset: CameraPreset) -> str:
    return (
        f"Name: {preset.name} ({preset.name_zh})\n"
        f"Category: {preset.category}\n"
        f"Camera: {preset.camera}\n"
        f"Motion: {preset.motion}\n"
        f"Lens: {preset.lens}\n"
        f"Lighting: {preset.lighting}\n"
        f"Composition: {preset.composition}\n"
        f"Seedance tip: {preset.seedance_tip}"
    )
