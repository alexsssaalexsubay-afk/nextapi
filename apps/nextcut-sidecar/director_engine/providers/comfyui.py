"""ComfyUI provider — submit workflow JSON, stream progress."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import httpx
import websockets

from director_engine.interfaces.models import VideoGenerationParams


class ComfyUIProvider:
    def __init__(self, base_url: str = "http://localhost:8188") -> None:
        self.base_url = base_url.rstrip("/")
        self.ws_url = base_url.replace("http", "ws") + "/ws"
        self.client_id = uuid.uuid4().hex[:8]

    async def is_connected(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/system_stats")
                return resp.status_code == 200
        except Exception:
            return False

    async def generate(self, params: VideoGenerationParams) -> dict[str, Any]:
        workflow = self._build_workflow(params)
        return await self.submit_workflow(workflow)

    async def submit_workflow(self, workflow: dict[str, Any]) -> dict[str, Any]:
        payload = {"prompt": workflow, "client_id": self.client_id}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}/prompt", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return {"job_id": data.get("prompt_id", ""), "status": "queued"}

    async def poll_status(self, job_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/history/{job_id}")
            resp.raise_for_status()
            data = resp.json()
            if job_id in data:
                outputs = data[job_id].get("outputs", {})
                return {"status": "completed", "outputs": outputs}
            return {"status": "running"}

    async def stream_progress(self, job_id: str):
        """Yield progress events from ComfyUI WebSocket."""
        try:
            async with websockets.connect(f"{self.ws_url}?clientId={self.client_id}") as ws:
                async for msg in ws:
                    if isinstance(msg, str):
                        data = json.loads(msg)
                        yield data
                        if data.get("type") == "executed" and data.get("data", {}).get("prompt_id") == job_id:
                            break
        except Exception:
            pass

    async def cancel(self, job_id: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(
                    f"{self.base_url}/interrupt",
                    json={},
                )
                return resp.status_code == 200
        except Exception:
            return False

    async def get_models(self) -> dict[str, list[str]]:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/object_info")
            resp.raise_for_status()
            data = resp.json()
            models: dict[str, list[str]] = {}
            for node_name, node_info in data.items():
                inputs = node_info.get("input", {}).get("required", {})
                for param_name, param_info in inputs.items():
                    if isinstance(param_info, list) and len(param_info) > 0 and isinstance(param_info[0], list):
                        models[f"{node_name}.{param_name}"] = param_info[0]
            return models

    def _build_workflow(self, params: VideoGenerationParams) -> dict[str, Any]:
        """Build a basic Seedance/LTX ComfyUI workflow from generation params."""
        workflow: dict[str, Any] = {}
        workflow["1"] = {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": "LTX-Video/ltx-2.3-22b-distilled-1.1.safetensors"},
        }
        workflow["2"] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": params.prompt, "clip": ["1", 1]},
        }
        workflow["3"] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": params.negative_prompt or "", "clip": ["1", 1]},
        }
        workflow["4"] = {
            "class_type": "EmptyLatentVideo" if not params.image_urls else "LoadImage",
            "inputs": {"width": 960, "height": 544, "length": params.duration * 24, "batch_size": 1}
            if not params.image_urls
            else {"image": params.image_urls[0]},
        }
        workflow["5"] = {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": -1,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
            },
        }
        workflow["6"] = {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        }
        workflow["7"] = {
            "class_type": "SaveVideo",
            "inputs": {"images": ["6", 0], "filename_prefix": "NextCut"},
        }
        return workflow
