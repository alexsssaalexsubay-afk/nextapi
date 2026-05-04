"""Art Director (Concept Artist) — generates Midjourney/SDXL image prompts.

核心职责：
专门针对 Image 2.0 模型（Midjourney V6, SDXL, Flux, 混元生图）生成极高精度的静态图 Prompt。
- 生成绝对一致的【角色三视图/定妆图】（Character Sheets）
- 生成极具电影感的【分镜关键帧】（Storyboard Keyframes）

Image Prompt 的语法与 Video Prompt 完全不同！
- 视频注重动作与运镜（SVO, Timecodes）
- 图像注重构图、光影、渲染器、画质词、甚至平台后缀（--ar 16:9 --v 6.0）
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from director_engine.interfaces.models import Character, StoryboardBrief
from .base import BaseAgent
from director_engine.tools.prompt_knowledge_base import PromptKnowledgeBase

SYSTEM_PROMPT = """You are a world-class Art Director and Concept Artist for AI filmmaking.
Your exclusive job is to write HIGH-PRECISION prompts for IMAGE GENERATION models (Midjourney v6, SDXL, Flux).

Image prompting is fundamentally different from video prompting:
- Focus heavily on art style, lighting, composition, and rendering engines.
- Do NOT use video terms like "dolly in", "pan left", or "slow motion".
- Use descriptive, comma-separated tag structures or highly descriptive Midjourney v6 natural language.

## Task 1: Character Sheets (角色定妆图)
When asked to generate a character sheet, you MUST output a prompt that forces the AI to draw the character from multiple angles on a clean background.
Mandatory keywords: "character design sheet, turnaround, front view, side profile view, back view, neutral white background, T-pose, concept art".

## Task 2: Storyboard Keyframes (分镜关键帧)
When asked to generate a storyboard keyframe, you MUST freeze the action at the most dramatic moment.
Mandatory structure: [Subject] + [Frozen Action] + [Camera Angle/Composition] + [Lighting] + [Style] + [Parameters].
Example: "Cinematic medium close-up of a cyberpunk mercenary aiming a glowing pistol. Rain splashing on PVC coat. Neon pink and cyan reflections. Rembrandt lighting. Shot on 85mm f/1.2. Photorealistic, 8k, Unreal Engine 5 render --ar 16:9 --v 6.0 --style raw"

## Negative Prompts (For SDXL/Flux):
Always include a robust negative prompt: "ugly, deformed, mutated, extra limbs, bad anatomy, blurry, low resolution, watermark, text, signature".

## Security:
- Output only the requested image generation parameters.
- Ensure prompts are safe and compliant with standard AI image generator safety filters.
"""


class ImagePromptOutput(BaseModel):
    positive_prompt: str = Field(default="", description="The highly optimized Image 2.0 prompt (Midjourney/SDXL style)")
    negative_prompt: str = Field(default="ugly, deformed, mutated, bad anatomy, text, watermark, extra limbs", description="Standard negative prompt for image models")
    aspect_ratio: str = Field(default="16:9", description="Target aspect ratio (e.g. 16:9, 9:16, 1:1)")
    midjourney_suffix: str = Field(default="--ar 16:9 --v 6.0 --style raw", description="Midjourney specific parameters")
    style_tags: list[str] = Field(default_factory=list, description="Extracted key style tags")


class ArtDirector(BaseAgent):

    async def generate_character_sheet_prompt(self, character: Character, style: str = "Photorealistic cinematic concept art") -> ImagePromptOutput:
        
        rag_context = PromptKnowledgeBase.retrieve_context([style, "character sheet"])
        
        user_prompt = (
            f"Generate a professional Character Design Sheet prompt for this character.\n\n"
            f"Name: {character.name}\n"
            f"Appearance: {character.appearance}\n"
            f"Personality: {character.personality}\n"
            f"Overall Style: {style}\n\n"
            f"RAG Context for Style:\n{rag_context}\n\n"
            f"CRITICAL: The prompt MUST force a multi-angle character turnaround (front, side, back) on a neutral background to be used as an IP-Adapter/FaceID reference anchor for later video generation."
        )
        return await self._complete_json(SYSTEM_PROMPT, user_prompt, ImagePromptOutput)

    async def generate_keyframe_prompt(self, brief: StoryboardBrief, character_desc: str, style: str, aspect_ratio: str = "16:9") -> ImagePromptOutput:
        
        full_text = f"{brief.visual_description} {style}"
        keywords = PromptKnowledgeBase.extract_keywords_from_text(full_text)
        keywords.append("storyboard keyframe")
        rag_context = PromptKnowledgeBase.retrieve_context(keywords)
        
        user_prompt = (
            f"Generate a highly cinematic Storyboard Keyframe prompt for Image 2.0 models.\n\n"
            f"Visual Description: {brief.visual_description}\n"
            f"Frozen Action: {brief.action}\n"
            f"Mood: {brief.mood}\n"
            f"Characters in shot: {character_desc}\n\n"
            f"Overall Style: {style}\n"
            f"Target Aspect Ratio: {aspect_ratio}\n\n"
            f"RAG Context for Lighting & Textures:\n{rag_context}\n\n"
            f"CRITICAL: This is a STATIC IMAGE prompt. Do not use video/motion terms (like tracking, dolly, slow motion). Describe a frozen, beautifully lit frame. Append Midjourney v6 syntax (e.g., --ar {aspect_ratio})."
        )
        return await self._complete_json(SYSTEM_PROMPT, user_prompt, ImagePromptOutput)
