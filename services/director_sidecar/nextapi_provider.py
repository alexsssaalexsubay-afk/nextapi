from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class ProviderMessage:
    content: str


class NextAPIProviderError(RuntimeError):
    pass


class NextAPIChatModel:
    """Small LangChain-compatible adapter backed by the Go Provider runtime."""

    def __init__(
        self,
        *,
        callback_base_url: str,
        callback_token: str,
        provider_id: str | None = None,
        org_id: str | None = None,
        timeout_seconds: float = 90.0,
    ) -> None:
        self.callback_base_url = callback_base_url.rstrip("/")
        self.callback_token = callback_token
        self.provider_id = provider_id or ""
        self.org_id = org_id or ""
        self.timeout_seconds = timeout_seconds

    def __or__(self, parser: Any) -> "_ProviderParserChain":
        return _ProviderParserChain(self, parser)

    async def ainvoke(self, messages: Any) -> ProviderMessage:
        if not self.callback_base_url or not self.callback_token:
            raise NextAPIProviderError("director runtime callback is not configured")
        payload = {
            "provider_id": self.provider_id,
            "org_id": self.org_id,
            "messages": _normalize_messages(messages),
            "options": {
                "json_mode": _looks_like_json_task(messages),
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            res = await client.post(
                f"{self.callback_base_url}/text",
                json=payload,
                headers={"X-Director-Runtime-Token": self.callback_token},
            )
        if res.status_code < 200 or res.status_code >= 300:
            raise NextAPIProviderError(f"text provider callback failed: {res.status_code}")
        data = res.json()
        text = str(data.get("text") or "").strip()
        if not text:
            raise NextAPIProviderError("text provider returned an empty response")
        return ProviderMessage(content=text)


class _ProviderParserChain:
    def __init__(self, model: NextAPIChatModel, parser: Any) -> None:
        self.model = model
        self.parser = parser

    async def ainvoke(self, messages: Any) -> Any:
        response = await self.model.ainvoke(messages)
        if hasattr(self.parser, "parse"):
            return self.parser.parse(response.content)
        if hasattr(self.parser, "ainvoke"):
            return await self.parser.ainvoke(response.content)
        raise NextAPIProviderError("unsupported parser")


def _normalize_messages(messages: Any) -> list[dict[str, str]]:
    if messages is None:
        return []
    if not isinstance(messages, list):
        messages = [messages]
    out: list[dict[str, str]] = []
    for item in messages:
        role = "user"
        content = ""
        if isinstance(item, tuple) and len(item) >= 2:
            role = str(item[0])
            content = str(item[1])
        elif isinstance(item, dict):
            role = str(item.get("role") or item.get("type") or "user")
            content = str(item.get("content") or "")
        else:
            role = str(getattr(item, "type", "") or getattr(item, "role", "") or "user")
            content = str(getattr(item, "content", "") or "")
        out.append({"role": _normalize_role(role), "content": content})
    return out


def _normalize_role(role: str) -> str:
    role = role.lower().strip()
    if role in {"system"}:
        return "system"
    if role in {"assistant", "ai"}:
        return "assistant"
    return "user"


def _looks_like_json_task(messages: Any) -> bool:
    text = "\n".join(m["content"] for m in _normalize_messages(messages)).lower()
    return "json" in text or "format_instructions" in text or "schema" in text
