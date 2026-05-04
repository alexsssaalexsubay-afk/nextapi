"""Consistency Checker — verifies cross-shot visual and narrative consistency.

核心职责：
1. 角色漂移检测（AI视频最大痛点）
2. 视觉风格一致性
3. 镜头语言合规（单一运镜原则）
4. 叙事/时间线逻辑
5. 音频格式正确性（lip-sync双引号）
6. Seedance API限制合规（质量、词数、格式）
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field

from director_engine.interfaces.models import Character, DirectorShot

from .base import BaseAgent

SYSTEM_PROMPT = """You are an elite Continuity Supervisor and Anti-Hallucination Quality Assurance Specialist for industrial AI video pipelines.
Your job is the final firewall before expensive API calls. You must ruthlessly hunt down and eliminate latent space bleeding, physical impossibilities, and temporal discontinuities.

## ZERO-TOLERANCE ANTI-HALLUCINATION PROTOCOL (Priority Order):

### 1. CHARACTER IDENTITY DRIFT (CRITICAL - The #1 AI Failure):
Diffusion models possess ZERO object permanence. You must verify:
- Exact string matching for physical descriptions across all shots. If Shot 1 says "fitted navy blazer", Shot 2 CANNOT say "blue jacket". It will generate a completely different garment.
- Verify that identity anchors (e.g., "image 1 as character reference") are present in every single shot featuring that character.
- Flag any contradictions immediately.

### 2. PHYSICS ENGINE & VERB BLOAT (CRITICAL):
Current generation models cannot handle complex, multi-stage physics.
- The "One Shot = One Action" Rule: If a prompt has more than TWO distinct verbs in the action block (e.g., "She runs, jumps over the barrel, and shoots the target while smiling"), it WILL hallucinate limbs and morph objects. FLAG THIS AS CRITICAL.
- Impossible physics: E.g., "Camera follows the bullet in slow motion while the background spins." Flag and suggest a simplified, achievable alternative.

### 3. API COMPLIANCE & SYNTAX VALIDATION (CRITICAL):
- ABSOLUTELY NO `@` syntax (e.g., `@Image1`, `@Video`). The API will crash or ignore it. It must be natural language ("image 1").
- Video quality constraints: Must be exactly "480p", "720p", or "1080p". Anything else ("4k", "2k") is invalid.
- Word count: Warn if prompt is < 20 words (too vague) or > 120 words (attention dilution). Ideal is 30-80.

### 4. CINEMATOGRAPHIC LOGIC (WARNING):
- Ensure ONLY ONE camera movement exists per shot. "Pan left and push in" is an automatic warning.
- Ensure the color grade and lighting scheme remain mathematically consistent within a scene.

### 5. AUDIO & LIP-SYNC FORMATTING (WARNING):
- Dialogue MUST be wrapped in double quotes `""` and preceded by a speaker attribution (e.g., John speaks: "Wait."). Otherwise, the lip-sync module will fail to trigger.

## Output Severity Scale:
- **critical**: Will cause API crash, severe hallucination, or catastrophic identity loss. Must be fixed before rendering.
- **warning**: High risk of AI morphing, poor cinematic quality, or slight continuity errors.
- **info**: Optimization suggestions for better prompt adhesion.

## Masterclass Example:
Issue found: Character verb bloat and conflicting wardrobe.
```json
{
  "shot_ids": ["shot_1", "shot_2"],
  "type": "character_drift_and_hallucination",
  "severity": "critical",
  "description": "Shot 1 describes 'Detective Kim in a grey wool coat'. Shot 2 describes 'Kim in a dark trenchcoat running, grabbing the gun, jumping the fence, and aiming'. This breaks wardrobe continuity AND violates the 'One Action' rule (4 verbs). The AI will morph her body into the fence.",
  "suggestion": "1. Standardize wardrobe: use 'grey wool coat' in both. 2. Break Shot 2 into two shots: one for running/grabbing, one for aiming. Remove the fence jump to maintain physics stability."
}
```

## Execution:
Evaluate the shots mercilessly. Do not be polite. The rendering budget depends on your strictness."""


class ConsistencyIssue(BaseModel):
    shot_ids: list[str] = Field(default_factory=list, description="IDs of affected shots")
    type: str = Field(default="", description="character_drift|prompt_quality|camera|visual_style|narrative|audio|api_compliance")
    severity: str = Field(default="warning", description="critical|warning|info")
    description: str = Field(default="", description="Specific, actionable description of the issue")
    suggestion: str = Field(default="", description="Exact fix — what to change in which shot's prompt")


class ConsistencyReport(BaseModel):
    issues: list[ConsistencyIssue] = Field(default_factory=list, description="All issues found, ordered by severity")
    overall_score: float = Field(default=1.0, description="0.0 (terrible) to 1.0 (perfect)")
    character_drift_risk: float = Field(default=0.0, description="0.0 (no risk) to 1.0 (will definitely drift)")
    prompt_quality_score: float = Field(default=1.0, description="Average prompt quality: 0.0 (poor) to 1.0 (excellent)")
    notes: str = Field(default="", description="Overall assessment summary")


class ConsistencyChecker(BaseAgent):

    async def check(self, shots: list[DirectorShot], characters: list[Character]) -> ConsistencyReport:
        shots_text = "\n\n".join(
            f"Shot {s.id} (index {s.index}):\n"
            f"  Camera: {s.camera.camera}\n"
            f"  Motion: {s.camera.motion}\n"
            f"  Prompt: {s.prompt}\n"
            f"  Negative prompt: {s.negative_prompt}\n"
            f"  Duration: {s.duration}s\n"
            f"  Transition: {s.edit.transition_type}\n"
            f"  Dialogue: {s.audio.dialogue}\n"
            f"  Lip-sync: {s.audio.lip_sync}\n"
            f"  Image refs: {len([r for r in s.references if r.type == 'image'])}\n"
            f"  Video refs: {len([r for r in s.references if r.type == 'video'])}\n"
            f"  Audio refs: {len([r for r in s.references if r.type == 'audio'])}\n"
            f"  Prompt word count: {len(s.prompt.split())}\n"
            f"  Quality: {s.generation_params.quality if s.generation_params else 'not set'}"
            for s in shots
        )
        chars_text = "\n".join(
            f"- {c.name}: {c.appearance} (reference images: {len(c.reference_images)})"
            for c in characters
        )
        user_prompt = (
            f"=== SHOTS ({len(shots)} total) ===\n{shots_text}\n\n"
            f"=== CHARACTERS ({len(characters)} total) ===\n{chars_text}\n\n"
            f"Run ALL checks. Prioritize:\n"
            f"1. Character drift risk (same description, same references? verify images if attached!)\n"
            f"2. API compliance (quality values, no @Tag syntax)\n"
            f"3. Prompt quality (30-80 words, SVO, physical descriptions)\n"
            f"4. Single camera movement per shot\n"
            f"5. Dialogue formatting (double quotes + speaker prefix for lip-sync)\n"
            f"6. Color grade consistency within scenes"
        )
        
        user_content: list[Any] = [{"type": "text", "text": user_prompt}]
        for char in characters:
            for ref in char.reference_images:
                if ref.startswith(("http", "data:image")):
                    user_content.append({"type": "image_url", "image_url": {"url": ref, "detail": "low"}})

        return await self._complete_json(SYSTEM_PROMPT, user_content, ConsistencyReport)
