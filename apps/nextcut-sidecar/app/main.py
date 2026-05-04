import asyncio
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.events import event_bus, Event, EventType
from app.api.director import router as director_router
from app.api.agents import router as agents_router
from app.api.comfyui import router as comfyui_router
from app.api.models import router as models_router
from app.api.projects import router as projects_router
from app.api.auth import router as auth_router
from app.api.setup import router as setup_router
from app.api.quickcreate import router as quickcreate_router
from app.api.generate import router as generate_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    await event_bus.publish(
        Event(type=EventType.SYSTEM_STATUS, data={"status": "ready", "version": "0.1.0"})
    )
    yield


app = FastAPI(
    title="NextCut Sidecar",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "https://cut.nextapi.top", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(director_router, prefix="/director", tags=["director"])
app.include_router(agents_router, prefix="/agents", tags=["agents"])
app.include_router(comfyui_router, prefix="/comfyui", tags=["comfyui"])
app.include_router(models_router, prefix="/models", tags=["models"])
app.include_router(projects_router, prefix="/projects", tags=["projects"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(setup_router, prefix="/setup", tags=["setup"])
app.include_router(quickcreate_router, prefix="/quickcreate", tags=["quickcreate"])
app.include_router(generate_router, prefix="/generate", tags=["generate"])

os.makedirs("exports", exist_ok=True)
app.mount("/exports", StaticFiles(directory="exports"), name="exports")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}


@app.post("/shutdown")
async def shutdown():
    import os
    import signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting_down"}


@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await websocket.accept()
    q = event_bus.subscribe()
    try:
        async for message in event_bus.stream(q):
            await websocket.send_text(message)
    except WebSocketDisconnect:
        event_bus.unsubscribe(q)
    except asyncio.CancelledError:
        event_bus.unsubscribe(q)


def main():
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )


if __name__ == "__main__":
    main()
