"""ComfyUI WebSocket bridge — connects NextAPI Studio to a running ComfyUI instance.

Supports:
- Status check (is ComfyUI reachable?)
- Workflow submission via REST
- Real-time progress relay via WebSocket bridge
"""

import asyncio
import json
import logging
from typing import Any

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.events import event_bus, Event, EventType

logger = logging.getLogger(__name__)

router = APIRouter()

_comfyui_connected = False


def _comfyui_http_url() -> str:
    return settings.comfyui_url.replace("ws://", "http://").replace("wss://", "https://")


@router.get("/status")
async def comfyui_status():
    global _comfyui_connected
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{_comfyui_http_url()}/system_stats")
            _comfyui_connected = resp.status_code == 200
            if _comfyui_connected:
                stats = resp.json()
                return {
                    "connected": True,
                    "url": settings.comfyui_url,
                    "system": stats,
                }
    except Exception:
        _comfyui_connected = False

    return {"connected": False, "url": settings.comfyui_url}


@router.get("/models")
async def comfyui_models():
    """List models available in ComfyUI (checkpoints, loras, etc.)."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{_comfyui_http_url()}/object_info")
            if resp.status_code == 200:
                data = resp.json()
                checkpoints = []
                loader_info = data.get("CheckpointLoaderSimple", {})
                if loader_info:
                    ckpt_input = loader_info.get("input", {}).get("required", {}).get("ckpt_name", [[]])
                    checkpoints = ckpt_input[0] if isinstance(ckpt_input[0], list) else []
                return {"checkpoints": checkpoints}
    except Exception:
        pass
    return {"checkpoints": []}


@router.post("/workflow")
async def submit_workflow(workflow: dict[str, Any]):
    """Submit a ComfyUI workflow JSON for execution."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{_comfyui_http_url()}/prompt",
                json={"prompt": workflow},
            )
            if resp.status_code == 200:
                data = resp.json()
                prompt_id = data.get("prompt_id", "")
                await event_bus.publish(
                    Event(
                        type=EventType.VIDEO_PROGRESS,
                        data={"source": "comfyui", "status": "submitted", "prompt_id": prompt_id},
                    )
                )
                return {"status": "submitted", "prompt_id": prompt_id}
            else:
                return {"status": "error", "detail": resp.text[:200]}
    except httpx.ConnectError:
        return {"status": "error", "detail": "ComfyUI is not reachable"}
    except Exception as e:
        logger.warning("ComfyUI workflow submit failed: %s", str(e)[:200])
        return {"status": "error", "detail": "Failed to submit workflow"}


@router.get("/history/{prompt_id}")
async def get_history(prompt_id: str):
    """Get execution history for a specific prompt."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{_comfyui_http_url()}/history/{prompt_id}")
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {"error": "Could not retrieve history"}


@router.websocket("/ws")
async def comfyui_bridge_ws(websocket: WebSocket):
    """Bridge WebSocket that proxies between frontend and ComfyUI."""
    await websocket.accept()

    import websockets

    comfyui_ws = None
    try:
        comfyui_ws = await websockets.connect(f"{settings.comfyui_url}/ws")

        async def relay_from_comfyui():
            async for message in comfyui_ws:
                if isinstance(message, str):
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type", "")

                        if msg_type == "progress":
                            pdata = data.get("data", {})
                            await event_bus.publish(Event(
                                type=EventType.VIDEO_PROGRESS,
                                data={
                                    "source": "comfyui",
                                    "node": pdata.get("node", ""),
                                    "value": pdata.get("value", 0),
                                    "max": pdata.get("max", 0),
                                },
                            ))

                        await websocket.send_text(message)
                    except json.JSONDecodeError:
                        await websocket.send_text(message)

        async def relay_from_frontend():
            while True:
                data = await websocket.receive_text()
                await comfyui_ws.send(data)

        await asyncio.gather(relay_from_comfyui(), relay_from_frontend())

    except WebSocketDisconnect:
        pass
    except ImportError:
        await websocket.send_text(json.dumps({
            "type": "error",
            "data": {"message": "websockets package not installed"},
        }))
    except Exception as e:
        logger.warning("ComfyUI bridge error: %s", str(e)[:200])
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "data": {"message": "ComfyUI connection failed"},
            }))
        except Exception:
            pass
    finally:
        if comfyui_ws:
            await comfyui_ws.close()
