from __future__ import annotations

import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .app import CallbackConfig, ProviderPolicy, StoryboardRequest
from .vimax_bridge import ManagedDirectorBridge


class _FakeProviderHandler(BaseHTTPRequestHandler):
    token = "smoke-runtime-token"
    calls: list[str] = []

    def do_POST(self) -> None:
        if self.path != "/text":
            self.send_error(404)
            return
        if self.headers.get("X-Director-Runtime-Token") != self.token:
            self.send_error(401)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        text = "\n".join(str(message.get("content", "")) for message in body.get("messages", []))
        self.calls.append(text)
        payload = {"text": _response_for(text)}
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:
        return


def _response_for(prompt: str) -> str:
    lowered = prompt.lower()
    if "extract all relevant character" in lowered:
        return json.dumps({
            "characters": [{
                "idx": 0,
                "identifier_in_scene": "Lin",
                "is_visible": True,
                "static_features": "young creator with clear eyes and a calm face",
                "dynamic_features": "silver jacket, black trousers, small camera bag",
            }],
        })
    if "design a complete storyboard" in lowered:
        return json.dumps({
            "storyboard": [
                {
                    "idx": 0,
                    "is_last": False,
                    "cam_idx": 0,
                    "visual_desc": "Wide cinematic shot of <Lin> entering a neon rain street, reflections glowing on the ground.",
                    "audio_desc": "[Sound Effect] soft rain and distant traffic",
                },
                {
                    "idx": 1,
                    "is_last": True,
                    "cam_idx": 1,
                    "visual_desc": "Close-up of <Lin> lifting a glowing card, face stable, silver jacket consistent.",
                    "audio_desc": "[Speaker] Lin (determined): We start now.",
                },
            ],
        })
    if "adapt the user's input story" in lowered or "write_script_based_on_story" in lowered:
        return json.dumps({
            "script": [
                "EXT. NEON STREET - NIGHT. Lin steps through rain, holding a glowing card. The city signs pulse behind them.",
            ],
        })
    return (
        "Story Title: Neon Card\n"
        "Target Audience & Genre: This story is targeted at creators, in the short drama genre.\n"
        "A creator named Lin discovers a glowing card that unlocks a new production world and decides to start immediately."
    )


async def _run_smoke() -> dict[str, Any]:
    _FakeProviderHandler.calls = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeProviderHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = StoryboardRequest(
            story="一个创作者在雨夜发现发光卡片，决定开启新世界。",
            genre="short drama",
            style="cinematic realistic",
            shot_count=2,
            duration_per_shot=5,
            text_provider_id="smoke-text-provider",
            callback=CallbackConfig(
                base_url=f"http://127.0.0.1:{server.server_port}",
                token=_FakeProviderHandler.token,
            ),
            policy=ProviderPolicy(no_external_keys=True),
        )
        result = await ManagedDirectorBridge(Path(os.getenv("NEXTAPI_REPO_ROOT", Path.cwd()))).run(request)
        shots = result.get("storyboard", {}).get("shots", [])
        audit = result.get("audit", {})
        if len(shots) != 2:
            raise RuntimeError(f"expected 2 shots, got {len(shots)}")
        if len(_FakeProviderHandler.calls) < 3:
            raise RuntimeError(f"expected provider callback calls, got {len(_FakeProviderHandler.calls)}")
        if audit.get("source") != "vendored_director_pipeline":
            raise RuntimeError(f"unexpected source: {audit.get('source')}")
        if "chat_model.ainvoke -> NextAPI textProvider" not in audit.get("replaced_model_exits", []):
            raise RuntimeError("text provider exit was not replaced by NextAPI")
        if any(not shot.get("videoPrompt") or not shot.get("imagePrompt") for shot in shots):
            raise RuntimeError("all shots must include videoPrompt and imagePrompt")
        return {
            "status": "ok",
            "provider_callback_calls": len(_FakeProviderHandler.calls),
            "shot_count": len(shots),
            "source": audit.get("source"),
            "reusable_modules": audit.get("reusable_modules", []),
            "replaced_model_exits": audit.get("replaced_model_exits", []),
        }
    finally:
        server.shutdown()
        server.server_close()


def main() -> None:
    print(json.dumps(asyncio.run(_run_smoke()), ensure_ascii=False))


if __name__ == "__main__":
    main()
