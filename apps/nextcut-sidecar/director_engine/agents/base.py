"""Base agent with fully configurable LLM backend.

2026-05 升级：
- 2层重试机制：解析失败 → 带错误信息重试 → 降温重试
- 更健壮的 JSON 提取（处理 markdown fence、前后废话）
- 字段描述作为嵌入式prompt（提升输出质量）
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from director_engine.interfaces.models import AgentConfig, LLMProvider
from director_engine.tools.runtime_prompts import resolve_system_prompt

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger(__name__)

MAX_RETRIES = 2


def create_llm_client(config: AgentConfig) -> AsyncOpenAI:
    base_url = config.resolve_base_url()
    api_key = config.api_key or "ollama"
    if config.provider == LLMProvider.OLLAMA:
        api_key = "ollama"
    return AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=config.timeout)


class BaseAgent:
    """Base for all Director Engine agents. Each agent gets its own LLM config."""

    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.client = create_llm_client(config)
        self.model = config.model

    async def _complete(self, system: str, user: str | list[Any], **kwargs: Any) -> str:
        system = resolve_system_prompt(system)
        resp = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=kwargs.get("temperature", self.config.temperature),
            max_tokens=kwargs.get("max_tokens", self.config.max_tokens),
        )
        return resp.choices[0].message.content or ""

    async def _complete_json(self, system: str, user: str | list[Any], schema: type[T], **kwargs: Any) -> T:
        system = resolve_system_prompt(system)
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        system_with_format = (
            f"{system}\n\n"
            f"## Output Format\n"
            f"Respond with a single valid JSON object matching this schema:\n"
            f"```json\n{schema_json}\n```\n"
            f"Rules:\n"
            f"- Return ONLY the JSON object\n"
            f"- No markdown fences, no explanations before/after\n"
            f"- All string fields must have values (use empty string \"\" if unknown)\n"
            f"- All list fields must be arrays (use [] if empty)"
        )

        last_error = ""
        for attempt in range(MAX_RETRIES + 1):
            try:
                temp = kwargs.get("temperature", self.config.temperature)
                if attempt > 0:
                    temp = max(0.0, temp - 0.2 * attempt)

                prompt = user
                if attempt > 0 and last_error:
                    prompt = (
                        f"{user}\n\n"
                        f"IMPORTANT: Your previous response failed to parse. Error: {last_error}\n"
                        f"Please fix and return ONLY valid JSON."
                    )

                raw = await self._complete(system_with_format, prompt, temperature=temp, **{k: v for k, v in kwargs.items() if k != "temperature"})
                cleaned = _extract_json(raw)
                return schema.model_validate_json(cleaned)

            except (ValidationError, json.JSONDecodeError, ValueError) as e:
                last_error = str(e)[:200]
                logger.warning("JSON parse attempt %d failed: %s", attempt + 1, last_error)
                if attempt == MAX_RETRIES:
                    raise


def _extract_json(raw: str) -> str:
    """从 LLM 输出中提取 JSON，处理各种常见格式问题。"""
    text = raw.strip()

    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")

    depth = 0
    in_string = False
    escape = False
    end = start
    for i in range(start, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i
                break

    return text[start : end + 1]
