"""Runtime configuration registry for models, prompts, and production capabilities."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from director_engine.agents.audio_director import SYSTEM_PROMPT as AUDIO_DIRECTOR_PROMPT
from director_engine.agents.character_extractor import SYSTEM_PROMPT as CHARACTER_EXTRACTOR_PROMPT
from director_engine.agents.cinematographer import SYSTEM_PROMPT as CINEMATOGRAPHER_PROMPT
from director_engine.agents.consistency_checker import SYSTEM_PROMPT as CONSISTENCY_CHECKER_PROMPT
from director_engine.agents.editing_agent import SYSTEM_PROMPT as EDITING_AGENT_PROMPT
from director_engine.agents.prompt_optimizer import SYSTEM_PROMPT as PROMPT_OPTIMIZER_PROMPT
from director_engine.agents.screenwriter import SYSTEM_PROMPT as SCREENWRITER_PROMPT
from director_engine.agents.storyboard_artist import SYSTEM_PROMPT as STORYBOARD_ARTIST_PROMPT
from director_engine.tools.runtime_prompts import (
    list_prompts,
    register_prompt,
    reset_prompt,
    update_prompt,
)

router = APIRouter()


class ModelPreset(BaseModel):
    id: str
    provider: str
    label: str
    model: str
    base_url: str
    api_kind: str = "openai-compatible"
    category: str = "llm"
    notes: str = ""


class PromptUpdateRequest(BaseModel):
    prompt: str = Field(min_length=20)


class LLMTestRequest(BaseModel):
    provider: str = "openai"
    model: str
    base_url: str = ""
    api_key: str = ""
    api_kind: str = "openai-compatible"


AGENT_PROMPTS = [
    ("screenwriter", "Alex", "编剧 / 故事结构", SCREENWRITER_PROMPT),
    ("character_extractor", "Maya", "角色抽取 / Identity Anchor", CHARACTER_EXTRACTOR_PROMPT),
    ("storyboard_artist", "Jin", "分镜 / 关键帧", STORYBOARD_ARTIST_PROMPT),
    ("cinematographer", "Leo", "摄影 / 运镜", CINEMATOGRAPHER_PROMPT),
    ("audio_director", "Aria", "声音 / 音乐 / SFX", AUDIO_DIRECTOR_PROMPT),
    ("editing_agent", "Sam", "剪辑 / 节奏", EDITING_AGENT_PROMPT),
    ("consistency_checker", "Mira", "一致性 / 质检", CONSISTENCY_CHECKER_PROMPT),
    ("prompt_optimizer", "Nova", "Seedance Prompt Optimizer", PROMPT_OPTIMIZER_PROMPT),
]

for prompt_id, label, role, prompt in AGENT_PROMPTS:
    register_prompt(prompt_id, label, role, prompt)


MODEL_PRESETS: list[ModelPreset] = [
    # OpenAI
    ModelPreset(id="openai-gpt-5", provider="openai", label="OpenAI GPT-5", model="gpt-5", base_url="https://api.openai.com/v1", notes="Frontier reasoning/coding, use when available on the account."),
    ModelPreset(id="openai-gpt-4-1", provider="openai", label="OpenAI GPT-4.1", model="gpt-4.1", base_url="https://api.openai.com/v1"),
    ModelPreset(id="openai-gpt-4-1-mini", provider="openai", label="OpenAI GPT-4.1 mini", model="gpt-4.1-mini", base_url="https://api.openai.com/v1"),
    ModelPreset(id="openai-gpt-4o", provider="openai", label="OpenAI GPT-4o", model="gpt-4o", base_url="https://api.openai.com/v1"),
    ModelPreset(id="openai-gpt-4o-mini", provider="openai", label="OpenAI GPT-4o mini", model="gpt-4o-mini", base_url="https://api.openai.com/v1"),
    ModelPreset(id="openai-o3", provider="openai", label="OpenAI o3", model="o3", base_url="https://api.openai.com/v1", notes="Reasoning model."),
    ModelPreset(id="openai-o4-mini", provider="openai", label="OpenAI o4-mini", model="o4-mini", base_url="https://api.openai.com/v1", notes="Reasoning model."),
    # Anthropic
    ModelPreset(id="anthropic-sonnet-4-5", provider="anthropic", label="Claude Sonnet 4.5", model="claude-sonnet-4-5", base_url="https://api.anthropic.com/v1", api_kind="anthropic"),
    ModelPreset(id="anthropic-opus-4-1", provider="anthropic", label="Claude Opus 4.1", model="claude-opus-4-1", base_url="https://api.anthropic.com/v1", api_kind="anthropic"),
    ModelPreset(id="anthropic-haiku-3-5", provider="anthropic", label="Claude Haiku 3.5", model="claude-3-5-haiku-latest", base_url="https://api.anthropic.com/v1", api_kind="anthropic"),
    # Google
    ModelPreset(id="google-gemini-2-5-pro", provider="google", label="Gemini 2.5 Pro", model="gemini-2.5-pro", base_url="https://generativelanguage.googleapis.com/v1beta", api_kind="google"),
    ModelPreset(id="google-gemini-2-5-flash", provider="google", label="Gemini 2.5 Flash", model="gemini-2.5-flash", base_url="https://generativelanguage.googleapis.com/v1beta", api_kind="google"),
    ModelPreset(id="google-gemini-2-5-flash-lite", provider="google", label="Gemini 2.5 Flash-Lite", model="gemini-2.5-flash-lite", base_url="https://generativelanguage.googleapis.com/v1beta", api_kind="google"),
    # China / Asia providers
    ModelPreset(id="deepseek-chat", provider="deepseek", label="DeepSeek Chat", model="deepseek-chat", base_url="https://api.deepseek.com/v1"),
    ModelPreset(id="deepseek-reasoner", provider="deepseek", label="DeepSeek Reasoner", model="deepseek-reasoner", base_url="https://api.deepseek.com/v1"),
    ModelPreset(id="qwen-plus", provider="qwen", label="Qwen Plus", model="qwen-plus", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"),
    ModelPreset(id="qwen-max", provider="qwen", label="Qwen Max", model="qwen-max", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"),
    ModelPreset(id="qwen-turbo", provider="qwen", label="Qwen Turbo", model="qwen-turbo", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"),
    ModelPreset(id="qwen3-max", provider="qwen", label="Qwen3 Max", model="qwen3-max", base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"),
    ModelPreset(id="moonshot-kimi-k2", provider="custom", label="Moonshot Kimi K2", model="kimi-k2-0905-preview", base_url="https://api.moonshot.ai/v1"),
    ModelPreset(id="moonshot-kimi-latest", provider="custom", label="Moonshot Kimi Latest", model="kimi-latest", base_url="https://api.moonshot.ai/v1"),
    ModelPreset(id="zhipu-glm-4-5", provider="custom", label="Zhipu GLM-4.5", model="glm-4.5", base_url="https://open.bigmodel.cn/api/paas/v4"),
    ModelPreset(id="minimax-text-01", provider="minimax", label="MiniMax Text-01", model="abab6.5s-chat", base_url="https://api.minimax.chat/v1"),
    # European / open providers
    ModelPreset(id="mistral-large-latest", provider="custom", label="Mistral Large", model="mistral-large-latest", base_url="https://api.mistral.ai/v1"),
    ModelPreset(id="mistral-small-latest", provider="custom", label="Mistral Small", model="mistral-small-latest", base_url="https://api.mistral.ai/v1"),
    ModelPreset(id="mistral-codestral-latest", provider="custom", label="Codestral", model="codestral-latest", base_url="https://api.mistral.ai/v1"),
    ModelPreset(id="cohere-command-a", provider="custom", label="Cohere Command A", model="command-a-03-2025", base_url="https://api.cohere.com/compatibility/v1"),
    # Aggregators / inference clouds
    ModelPreset(id="openrouter-gpt-4-1", provider="custom", label="OpenRouter GPT-4.1", model="openai/gpt-4.1", base_url="https://openrouter.ai/api/v1"),
    ModelPreset(id="openrouter-claude-sonnet", provider="custom", label="OpenRouter Claude Sonnet", model="anthropic/claude-sonnet-4.5", base_url="https://openrouter.ai/api/v1"),
    ModelPreset(id="openrouter-deepseek-r1", provider="custom", label="OpenRouter DeepSeek R1", model="deepseek/deepseek-r1", base_url="https://openrouter.ai/api/v1"),
    ModelPreset(id="groq-llama-3-3-70b", provider="custom", label="Groq Llama 3.3 70B", model="llama-3.3-70b-versatile", base_url="https://api.groq.com/openai/v1"),
    ModelPreset(id="groq-qwen3-32b", provider="custom", label="Groq Qwen3 32B", model="qwen/qwen3-32b", base_url="https://api.groq.com/openai/v1"),
    ModelPreset(id="together-llama-3-1-405b", provider="custom", label="Together Llama 3.1 405B", model="meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", base_url="https://api.together.xyz/v1"),
    ModelPreset(id="together-qwen2-5-72b", provider="custom", label="Together Qwen2.5 72B", model="Qwen/Qwen2.5-72B-Instruct-Turbo", base_url="https://api.together.xyz/v1"),
    ModelPreset(id="perplexity-sonar-pro", provider="custom", label="Perplexity Sonar Pro", model="sonar-pro", base_url="https://api.perplexity.ai"),
    ModelPreset(id="perplexity-sonar-reasoning-pro", provider="custom", label="Perplexity Sonar Reasoning Pro", model="sonar-reasoning-pro", base_url="https://api.perplexity.ai"),
    ModelPreset(id="fireworks-llama-v3p1-405b", provider="custom", label="Fireworks Llama 3.1 405B", model="accounts/fireworks/models/llama-v3p1-405b-instruct", base_url="https://api.fireworks.ai/inference/v1"),
    ModelPreset(id="cerebras-llama-4-scout", provider="custom", label="Cerebras Llama 4 Scout", model="llama-4-scout-17b-16e-instruct", base_url="https://api.cerebras.ai/v1"),
    ModelPreset(id="ollama-qwen2-5", provider="ollama", label="Ollama Qwen2.5 Local", model="qwen2.5:14b", base_url="http://localhost:11434/v1"),
]


CAPABILITIES = [
    {"id": "director_plan", "label": "AI Director Plan", "method": "POST", "path": "/director/plan", "configurable": ["pipeline.default_llm", "agent overrides", "references", "style", "duration"]},
    {"id": "prompt_action", "label": "Prompt rewrite actions", "method": "POST", "path": "/director/prompt/action", "configurable": ["action prompt", "target language"]},
    {"id": "generate_preflight", "label": "生成前检查", "method": "POST", "path": "/generate/preflight", "configurable": ["生成服务限制", "参考素材策略"]},
    {"id": "video_generate", "label": "Seedance Video Generate", "method": "POST", "path": "/generate/submit", "configurable": ["video_base_url", "video_model", "video_api_key", "quality"]},
    {"id": "video_batch", "label": "Batch Video Generate", "method": "POST", "path": "/generate/batch", "configurable": ["sequential", "shot payloads"]},
    {"id": "character_assets", "label": "Character Asset Pack", "method": "POST", "path": "/agents/generate-character-assets", "configurable": ["image model", "turnaround/expression/outfit/pose prompts"]},
    {"id": "storyboard_assets", "label": "Storyboard Keyframes", "method": "POST", "path": "/agents/generate-storyboard-assets", "configurable": ["image model", "first/last frame prompt", "aspect ratio"]},
]


@router.get("/llm-presets")
async def llm_presets():
    return {"presets": [preset.model_dump() for preset in MODEL_PRESETS]}


@router.get("/capabilities")
async def capabilities():
    return {"capabilities": CAPABILITIES}


@router.get("/prompts")
async def prompts():
    return {"prompts": [_prompt_payload(entry) for entry in list_prompts()]}


@router.put("/prompts/{prompt_id}")
async def save_prompt(prompt_id: str, req: PromptUpdateRequest):
    try:
        entry = update_prompt(prompt_id, req.prompt)
        return {"prompt": _prompt_payload(entry)}
    except KeyError:
        raise HTTPException(status_code=404, detail="Prompt not found") from None


@router.post("/prompts/{prompt_id}/reset")
async def restore_prompt(prompt_id: str):
    try:
        entry = reset_prompt(prompt_id)
        return {"prompt": _prompt_payload(entry)}
    except KeyError:
        raise HTTPException(status_code=404, detail="Prompt not found") from None


@router.post("/test-llm")
async def test_llm(req: LLMTestRequest):
    if not req.model.strip():
        raise HTTPException(status_code=400, detail="Model is required")
    if req.provider != "ollama" and not req.api_key.strip():
        return {"status": "needs_key", "message": "API Key 为空，已保存配置但无法真实连通测试。"}
    return {"status": "configured", "message": "配置格式可用。真实连通会在下一次 Agent 调用时验证。"}


def _prompt_payload(entry):
    return {
        "id": entry.id,
        "label": entry.label,
        "role": entry.role,
        "prompt": entry.prompt,
        "default_prompt": entry.default_prompt,
        "is_custom": entry.prompt != entry.default_prompt,
    }
