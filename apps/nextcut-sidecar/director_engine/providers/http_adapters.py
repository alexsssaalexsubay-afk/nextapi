"""Provider adapters for open HTTP, RunningHub, and local OpenAI-compatible APIs."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import httpx

from director_engine.interfaces.models import ProviderConfig, VideoGenerationParams

TERMINAL_SUCCESS = {"succeeded", "completed", "complete", "success", "done", "ready"}
TERMINAL_FAILURE = {"failed", "failure", "error", "cancelled", "canceled", "timeout"}


class CustomHttpProvider:
    """Configurable HTTP adapter for provider-native APIs.

    Expected provider_options:
    - endpoint / submit_path: submit endpoint, default /generate
    - method / submit_method: HTTP method, default POST
    - body / payload / request_body: native request body override
    - extra_body: merged into the default body
    - headers: extra request headers
    - status_path: polling endpoint, supports {job_id}
    - status_method: polling method, default GET
    - status_body: polling body, supports {job_id} only when dict values are strings
    - sync: mark submit response as final immediately
    """

    provider_name = "custom-http"
    default_submit_path = "/generate"
    default_status_path = "/generate/{job_id}"
    default_sync = False

    def __init__(self, config: ProviderConfig) -> None:
        self.config = config
        self.base_url = (config.base_url or "").rstrip("/")
        self._contexts: dict[str, dict[str, Any]] = {}
        self._finals: dict[str, dict[str, Any]] = {}

    async def generate(self, params: VideoGenerationParams) -> dict[str, Any]:
        options = params.provider_options or {}
        method = str(options.get("submit_method") or options.get("method") or "POST").upper()
        submit_path = str(
            options.get("submit_path") or options.get("endpoint") or self.default_submit_path
        )
        url = self._url(submit_path)
        body = self._build_submit_body(params, options)
        headers = self._headers(options)
        data = await self._request_json(method, url, headers=headers, json_body=body)
        job_id = str(
            _first_path(
                data,
                [
                    "id",
                    "job_id",
                    "jobId",
                    "task_id",
                    "taskId",
                    "data.id",
                    "data.job_id",
                    "data.jobId",
                    "data.task_id",
                    "data.taskId",
                ],
            )
            or uuid.uuid4().hex
        )
        status = _normalize_status(
            _first_path(data, ["status", "state", "data.status", "data.state"])
        )
        is_sync = bool(options.get("sync", self.default_sync))
        if is_sync and status not in TERMINAL_FAILURE:
            status = "succeeded"

        self._contexts[job_id] = {
            "options": options,
            "headers": headers,
            "status_path": str(options.get("status_path") or self.default_status_path),
            "status_method": str(options.get("status_method") or "GET").upper(),
            "status_body": options.get("status_body"),
        }
        if status in TERMINAL_SUCCESS or is_sync:
            self._finals[job_id] = {**data, "status": "succeeded"}

        return {
            "job_id": job_id,
            "status": status or "queued",
            "provider": self.config.provider or self.provider_name,
            "provider_model": params.model or self.config.model,
            "request_payload": {"method": method, "url": url, "headers": headers, "body": body},
            "upstream_response": data,
        }

    async def poll_status(self, job_id: str) -> dict[str, Any]:
        if job_id in self._finals:
            return {
                **self._finals[job_id],
                "status": _normalize_status(_first_path(self._finals[job_id], ["status", "state"]))
                or "succeeded",
            }
        context = self._contexts.get(job_id, {})
        method = str(context.get("status_method") or "GET").upper()
        status_path = str(context.get("status_path") or self.default_status_path).format(
            job_id=job_id
        )
        url = self._url(status_path)
        headers = context.get("headers") or self._headers({})
        body = _format_job_body(context.get("status_body"), job_id)
        data = await self._request_json(method, url, headers=headers, json_body=body)
        status = _normalize_status(
            _first_path(data, ["status", "state", "data.status", "data.state"])
        )
        if status in TERMINAL_SUCCESS:
            self._finals[job_id] = data
        return {**data, "status": status or "running", "job_id": job_id}

    async def wait_for_completion(
        self, job_id: str, timeout: float = 300.0, interval: float = 5.0
    ) -> dict[str, Any]:
        elapsed = 0.0
        while elapsed < timeout:
            result = await self.poll_status(job_id)
            status = str(result.get("status", "")).lower()
            if status in TERMINAL_SUCCESS:
                return {**result, "status": "succeeded"}
            if status in TERMINAL_FAILURE:
                return result
            await asyncio.sleep(interval)
            elapsed += interval
        return {"status": "timeout", "job_id": job_id}

    async def cancel(self, job_id: str) -> bool:
        context = self._contexts.get(job_id, {})
        options = context.get("options") or {}
        cancel_path = options.get("cancel_path")
        if not cancel_path:
            return False
        try:
            await self._request_json(
                str(options.get("cancel_method") or "POST").upper(),
                self._url(str(cancel_path).format(job_id=job_id)),
                headers=context.get("headers") or self._headers({}),
                json_body=_format_job_body(options.get("cancel_body"), job_id),
            )
            return True
        except Exception:
            return False

    def _build_submit_body(
        self, params: VideoGenerationParams, options: dict[str, Any]
    ) -> dict[str, Any]:
        override = options.get("body") or options.get("payload") or options.get("request_body")
        if isinstance(override, dict):
            body = dict(override)
        else:
            body = {
                "model": params.model or self.config.model,
                "prompt": params.prompt,
                "negative_prompt": params.negative_prompt,
                "duration": params.duration,
                "quality": params.quality,
                "aspect_ratio": params.aspect_ratio,
                "generate_audio": params.generate_audio,
                "image_urls": params.image_urls,
                "video_urls": params.video_urls,
                "audio_urls": params.audio_urls,
                "first_frame_url": params.first_frame_url,
                "last_frame_url": params.last_frame_url,
                "reference_instructions": params.reference_instructions,
            }
        extra_body = options.get("extra_body")
        if isinstance(extra_body, dict):
            body.update(extra_body)
        return body

    def _headers(self, options: dict[str, Any]) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        extra_headers = options.get("headers")
        if isinstance(extra_headers, dict):
            headers.update({str(key): str(value) for key, value in extra_headers.items()})
        return headers

    async def _request_json(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        json_body: Any = None,
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.request(
                method, url, headers=headers, json=json_body if method != "GET" else None
            )
            resp.raise_for_status()
            if not resp.content:
                return {"status": "succeeded"}
            try:
                data = resp.json()
            except ValueError:
                data = {"text": resp.text}
            return data if isinstance(data, dict) else {"data": data}

    def _url(self, path_or_url: str) -> str:
        if path_or_url.startswith(("http://", "https://")):
            return path_or_url
        return f"{self.base_url}{path_or_url if path_or_url.startswith('/') else '/' + path_or_url}"


class RunningHubProvider(CustomHttpProvider):
    provider_name = "runninghub"
    default_submit_path = "/task/openapi/create"
    default_status_path = "/task/openapi/outputs"

    def __init__(self, config: ProviderConfig) -> None:
        if not config.base_url:
            config = config.model_copy(update={"base_url": "https://www.runninghub.cn"})
        super().__init__(config)

    def _build_submit_body(
        self, params: VideoGenerationParams, options: dict[str, Any]
    ) -> dict[str, Any]:
        override = options.get("body") or options.get("payload") or options.get("request_body")
        if isinstance(override, dict):
            return dict(override)
        api_key = options.get("apiKey") or options.get("api_key") or self.config.api_key
        if options.get("webappId") or options.get("webapp_id"):
            return {
                "apiKey": api_key,
                "webappId": options.get("webappId") or options.get("webapp_id"),
                "nodeInfoList": options.get("nodeInfoList") or options.get("node_info_list") or [],
            }
        body = {
            "apiKey": api_key,
            "workflowId": options.get("workflowId")
            or options.get("workflow_id")
            or options.get("workflow"),
            "nodeInfoList": options.get("nodeInfoList") or options.get("node_info_list") or [],
        }
        if options.get("instanceType"):
            body["instanceType"] = options["instanceType"]
        return body

    async def generate(self, params: VideoGenerationParams) -> dict[str, Any]:
        options = params.provider_options or {}
        if (options.get("webappId") or options.get("webapp_id")) and not options.get("submit_path"):
            options = {**options, "submit_path": "/task/openapi/ai-app/run"}
            params = params.model_copy(update={"provider_options": options})
        return await super().generate(params)

    async def poll_status(self, job_id: str) -> dict[str, Any]:
        context = self._contexts.get(job_id, {})
        options = context.get("options") or {}
        if not options.get("status_path"):
            status_body = {
                "apiKey": options.get("apiKey") or options.get("api_key") or self.config.api_key,
                "taskId": job_id,
            }
            data = await self._request_json(
                "POST",
                self._url(self.default_status_path),
                headers=context.get("headers") or self._headers({}),
                json_body=status_body,
            )
            status = _runninghub_status(data)
            if status in TERMINAL_SUCCESS:
                self._finals[job_id] = data
            return {**data, "status": status, "job_id": job_id}
        return await super().poll_status(job_id)


class LocalOpenAICompatibleProvider(CustomHttpProvider):
    provider_name = "local-openai-compatible"
    default_submit_path = "/chat/completions"
    default_status_path = "/chat/completions/{job_id}"
    default_sync = True

    def __init__(self, config: ProviderConfig) -> None:
        if not config.base_url:
            config = config.model_copy(update={"base_url": "http://localhost:11434/v1"})
        super().__init__(config)

    def _build_submit_body(
        self, params: VideoGenerationParams, options: dict[str, Any]
    ) -> dict[str, Any]:
        override = options.get("body") or options.get("payload") or options.get("request_body")
        if isinstance(override, dict):
            return dict(override)
        endpoint = str(
            options.get("submit_path") or options.get("endpoint") or self.default_submit_path
        )
        if "images/generations" in endpoint:
            return {
                "model": params.model or self.config.model,
                "prompt": params.prompt,
                "n": int(options.get("n") or 1),
                "size": options.get("size") or "1024x1024",
            }
        return {
            "model": params.model or self.config.model,
            "messages": [
                {
                    "role": "system",
                    "content": options.get("system_prompt")
                    or (
                        "You are a local NextAPI Studio generation adapter. "
                        "Return provider-native JSON when possible."
                    ),
                },
                {"role": "user", "content": params.prompt},
            ],
            "temperature": options.get("temperature", 0.2),
            "stream": False,
        }


def _first_path(data: Any, paths: list[str]) -> Any:
    for path in paths:
        value = _value_at_path(data, path)
        if value not in (None, ""):
            return value
    return None


def _value_at_path(data: Any, path: str) -> Any:
    current = data
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _normalize_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    aliases = {
        "success": "succeeded",
        "completed": "succeeded",
        "complete": "succeeded",
        "done": "succeeded",
        "ready": "succeeded",
        "error": "failed",
        "failure": "failed",
        "canceled": "cancelled",
        "pending": "queued",
    }
    return aliases.get(status, status)


def _runninghub_status(data: dict[str, Any]) -> str:
    code = data.get("code")
    message = str(data.get("msg") or data.get("message") or "").lower()
    payload = data.get("data")
    if code in (0, "0") and payload:
        return "succeeded"
    if any(
        marker in message for marker in ("running", "queue", "pending", "processing", "not finish")
    ):
        return "running"
    if code not in (None, 0, "0"):
        return "failed"
    return "running"


def _format_job_body(body: Any, job_id: str) -> Any:
    if isinstance(body, dict):
        return {
            key: (value.format(job_id=job_id) if isinstance(value, str) else value)
            for key, value in body.items()
        }
    return body
