"""Provider adapter registry for NextCut generation."""

from __future__ import annotations

from collections.abc import Callable

from director_engine.interfaces.models import ProviderConfig
from director_engine.providers.base import VideoProvider
from director_engine.providers.comfyui import ComfyUIProvider
from director_engine.providers.http_adapters import (
    CustomHttpProvider,
    LocalOpenAICompatibleProvider,
    RunningHubProvider,
)
from director_engine.providers.seedance import SeedanceProvider

ProviderFactory = Callable[[ProviderConfig], VideoProvider]


PROVIDER_ALIASES: dict[str, str] = {
    "seedance": "seedance",
    "seedance-2": "seedance",
    "seedance-2.0": "seedance",
    "nextapi": "nextapi",
    "nextapi-seedance": "nextapi",
    "comfy": "comfyui",
    "comfyui": "comfyui",
    "runninghub": "runninghub",
    "running-hub": "runninghub",
    "local": "local-openai-compatible",
    "local-openai": "local-openai-compatible",
    "local-openai-compatible": "local-openai-compatible",
    "ollama": "local-openai-compatible",
    "lmstudio": "local-openai-compatible",
    "lm-studio": "local-openai-compatible",
    "custom": "custom-http",
    "custom-http": "custom-http",
    "http": "custom-http",
}


PROVIDER_FACTORIES: dict[str, ProviderFactory] = {
    "seedance": SeedanceProvider,
    "nextapi": SeedanceProvider,
    "comfyui": ComfyUIProvider,
    "runninghub": RunningHubProvider,
    "local-openai-compatible": LocalOpenAICompatibleProvider,
    "custom-http": CustomHttpProvider,
}


def normalize_provider_name(provider: str) -> str:
    key = (provider or "seedance").strip().lower().replace("_", "-")
    return PROVIDER_ALIASES.get(key, key)


def create_video_provider(config: ProviderConfig) -> VideoProvider:
    provider_name = normalize_provider_name(config.provider)
    factory = PROVIDER_FACTORIES.get(provider_name)
    if not factory:
        factory = CustomHttpProvider
        provider_name = "custom-http"
    normalized_config = config.model_copy(update={"provider": provider_name})
    return factory(normalized_config)


def list_video_providers() -> list[dict[str, str]]:
    labels = {
        "seedance": "Seedance",
        "nextapi": "NextAPI Video",
        "comfyui": "ComfyUI",
        "runninghub": "RunningHub",
        "local-openai-compatible": "Local OpenAI Compatible",
        "custom-http": "Custom HTTP",
    }
    return [
        {"id": provider_id, "label": labels.get(provider_id, provider_id)}
        for provider_id in PROVIDER_FACTORIES
    ]
