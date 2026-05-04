"""Core data models for the Director Engine.

Every model is a Pydantic BaseModel for validation, serialization,
and API exposure. No dataclasses — consistent typing throughout.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class LLMProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    DEEPSEEK = "deepseek"
    MINIMAX = "minimax"
    QWEN = "qwen"
    OLLAMA = "ollama"
    CUSTOM = "custom"


class AgentConfig(BaseModel):
    """Per-agent LLM configuration. Users can set different models for each agent."""

    provider: LLMProvider = LLMProvider.OPENAI
    model: str = "gpt-4o"
    base_url: str = ""
    api_key: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096
    timeout: float = 120.0

    def resolve_base_url(self) -> str:
        defaults = {
            LLMProvider.OPENAI: "https://api.openai.com/v1",
            LLMProvider.ANTHROPIC: "https://api.anthropic.com/v1",
            LLMProvider.GOOGLE: "https://generativelanguage.googleapis.com/v1beta",
            LLMProvider.DEEPSEEK: "https://api.deepseek.com/v1",
            LLMProvider.MINIMAX: "https://api.minimax.chat/v1",
            LLMProvider.QWEN: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            LLMProvider.OLLAMA: "http://localhost:11434/v1",
        }
        return self.base_url or defaults.get(self.provider, self.base_url)


class ProviderConfig(BaseModel):
    """Video generation provider configuration."""

    provider: str = "seedance"
    model: str = "seedance-2.0-pro"
    api_key: str = ""
    base_url: str = "https://api.nextapi.top/v1"
    quality: str = "720p"
    generate_audio: bool = True
    max_duration: int = 15


class PipelineConfig(BaseModel):
    """Full pipeline configuration — every step is independently configurable."""

    screenwriter: AgentConfig = Field(default_factory=AgentConfig)
    character_extractor: AgentConfig = Field(default_factory=AgentConfig)
    storyboard_artist: AgentConfig = Field(default_factory=AgentConfig)
    cinematographer: AgentConfig = Field(default_factory=AgentConfig)
    audio_director: AgentConfig = Field(default_factory=AgentConfig)
    editing_agent: AgentConfig = Field(default_factory=AgentConfig)
    consistency_checker: AgentConfig = Field(default_factory=AgentConfig)
    prompt_optimizer: AgentConfig = Field(default_factory=AgentConfig)

    video_provider: ProviderConfig = Field(default_factory=ProviderConfig)

    default_style: str = "cinematic realistic"
    default_aspect_ratio: str = "16:9"
    default_duration: int = 5
    default_shot_count: int = 6
    language: str = "en"

    def agent_config_for(self, agent_name: str) -> AgentConfig:
        return getattr(self, agent_name, AgentConfig())

    def set_all_agents(self, config: AgentConfig) -> None:
        """Apply one LLM config to all agents at once."""
        agent_fields = [
            "screenwriter", "character_extractor", "storyboard_artist",
            "cinematographer", "audio_director", "editing_agent",
            "consistency_checker", "prompt_optimizer",
        ]
        for field_name in agent_fields:
            setattr(self, field_name, config.model_copy())


class ReferenceAsset(BaseModel):
    """A reference asset (image, video, or audio) for Seedance 2.0."""

    url: str
    type: str = "image"
    role: str = ""
    description: str = ""


class Character(BaseModel):
    name: str
    description: str = ""
    appearance: str = ""
    personality: str = ""
    voice: str = ""
    reference_images: list[str] = Field(default_factory=list)


class StoryboardBrief(BaseModel):
    shot_number: int
    visual_description: str
    action: str = ""
    dialogue: str = ""
    mood: str = ""
    notes: str = ""


class ShotDecomposition(BaseModel):
    visual_desc: str = ""
    first_frame_desc: str = ""
    last_frame_desc: str = ""
    motion_desc: str = ""
    variation_desc: str = ""
    audio_desc: str = ""
    transition_in: str = ""
    transition_out: str = ""


class CameraLanguage(BaseModel):
    camera: str = ""
    motion: str = ""
    composition: str = ""
    lighting: str = ""
    lens: str = ""
    prompt: str = ""
    edit_intent: str = ""


class AudioPlan(BaseModel):
    music_style: str = ""
    music_tempo: str = ""
    sfx: list[str] = Field(default_factory=list)
    voiceover: str = ""
    dialogue: str = ""
    lip_sync: bool = False
    ambient: str = ""


class EditPlan(BaseModel):
    rhythm: str = "moderate"
    transition_type: str = "cut"
    pacing: str = "natural"
    duration_seconds: int = Field(default=5, description="Calculated duration for this shot in seconds based on narrative tension")
    color_grade: str = ""
    notes: str = ""


class DirectorScene(BaseModel):
    id: str
    index: int
    title: str
    description: str
    characters: list[str] = Field(default_factory=list)


class DirectorShot(BaseModel):
    id: str
    scene_id: str
    index: int
    title: str
    duration: int = 5
    aspect_ratio: str = "16:9"
    camera: CameraLanguage = Field(default_factory=CameraLanguage)
    audio: AudioPlan = Field(default_factory=AudioPlan)
    edit: EditPlan = Field(default_factory=EditPlan)
    decomposition: ShotDecomposition = Field(default_factory=ShotDecomposition)
    prompt: str = ""
    negative_prompt: str = ""
    continuity_group: str = ""
    references: list[ReferenceAsset] = Field(default_factory=list)
    status: str = "pending"
    video_url: str = ""
    thumbnail_url: str = ""
    generation_params: VideoGenerationParams | None = None


class VideoGenerationParams(BaseModel):
    """Parameters sent to the video generation provider."""

    model: str = "seedance-2.0-pro"
    prompt: str = ""
    negative_prompt: str = ""
    shot_script: str = ""
    constraints: str = ""
    audio_cues: list[str] = Field(default_factory=list)
    reference_instructions: list[str] = Field(default_factory=list)
    duration: int = 5
    quality: str = "720p"
    aspect_ratio: str = "16:9"
    generate_audio: bool = True
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    audio_urls: list[str] = Field(default_factory=list)
    
    # Advanced ControlNet / IP-Adapter Parameters
    controlnet_depth: float = Field(default=0.0, description="Weight for depth map control (0.0 to 1.0)")
    controlnet_scribble: float = Field(default=0.0, description="Weight for scribble/sketch control (0.0 to 1.0)")
    face_id_weight: float = Field(default=0.0, description="Strength of IP-Adapter FaceID consistency (0.0 to 1.0)")
    scribble_image_url: str = Field(default="", description="URL or base64 of the user's scribble/sketch")
    depth_image_url: str = Field(default="", description="URL or base64 of the depth map")

    provider_score: float = 0.0
    provider_reason: str = ""


class ProviderScoreResult(BaseModel):
    """Provider scoring result for model selection."""
    provider: str = ""
    model: str = ""
    total_score: float = 0.0
    reason: str = ""


class QualityScore(BaseModel):
    """Per-shot quality scoring from the Quality Agent (VLM-based)."""
    shot_id: str = ""
    overall: float = Field(default=0.0, description="Composite quality score 0.0-1.0")
    character_consistency: float = Field(default=0.0, description="Character identity consistency 0.0-1.0")
    prompt_quality: float = Field(default=0.0, description="How well the prompt translates to visual 0.0-1.0")
    style_coherence: float = Field(default=0.0, description="Style consistency across shots 0.0-1.0")
    issues: list[str] = Field(default_factory=list, description="Specific quality issues found")


class RenderJobRecord(BaseModel):
    """Observable render job record for tracking and optimization."""
    shot_id: str = ""
    template_id: str = ""
    template_version: str = ""
    workflow: str = "text_to_video"
    model: str = ""
    resolution: str = "720p"
    duration: int = 5
    ref_image_count: int = 0
    ref_video_count: int = 0
    ref_audio_count: int = 0
    prompt_word_count: int = 0
    retry_count: int = 0
    failure_reason: str = ""
    elapsed_ms: int = 0
    status: str = "pending"


class WorkflowTemplate(BaseModel):
    """First-class workflow template with full metadata."""
    id: str = ""
    name: str = ""
    name_zh: str = ""
    category: str = "system"
    description: str = ""
    version: str = "1.0.0"
    workflow: str = "text_to_video"
    style: str = "cinematic"
    shot_count: int = 6
    duration: str = ""
    media_types: list[str] = Field(default_factory=list)
    model_dependencies: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    tutorial_url: str = ""
    prompt: str = ""


class DirectorPlan(BaseModel):
    """Complete output of the Director Engine pipeline."""

    schema_version: str = "nextcut.director_plan.v1"
    source: str = "director_engine"
    title: str = ""
    summary: str = ""
    agent_chain: list[str] = Field(default_factory=list)
    scenes: list[DirectorScene] = Field(default_factory=list)
    shots: list[DirectorShot] = Field(default_factory=list)
    characters: list[Character] = Field(default_factory=list)
    quality_scores: list[QualityScore] = Field(default_factory=list)
    pipeline_config: PipelineConfig = Field(default_factory=PipelineConfig)
    provider_recommendation: ProviderScoreResult = Field(default_factory=ProviderScoreResult)
    workflow: dict[str, Any] = Field(default_factory=dict)
    workbench: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
