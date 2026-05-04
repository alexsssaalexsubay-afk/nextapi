import asyncio
import json
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class EventType(str, Enum):
    AGENT_START = "agent.start"
    AGENT_PROGRESS = "agent.progress"
    AGENT_COMPLETE = "agent.complete"
    AGENT_ERROR = "agent.error"
    PLAN_CREATED = "plan.created"
    PLAN_UPDATED = "plan.updated"
    SHOT_GENERATED = "shot.generated"
    VIDEO_PROGRESS = "video.progress"
    VIDEO_COMPLETE = "video.complete"
    SYSTEM_STATUS = "system.status"


@dataclass
class Event:
    type: EventType
    data: dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_json(self) -> str:
        return json.dumps({"type": self.type.value, "data": self.data, "ts": self.timestamp})


class EventBus:
    """Fan-out event bus for broadcasting events to multiple WebSocket clients."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[Event]] = []

    def subscribe(self) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=256)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[Event]) -> None:
        self._subscribers = [s for s in self._subscribers if s is not q]

    async def publish(self, event: Event) -> None:
        for q in self._subscribers:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def stream(self, q: asyncio.Queue[Event]) -> AsyncGenerator[str, None]:
        try:
            while True:
                event = await q.get()
                yield event.to_json()
        except asyncio.CancelledError:
            pass
        finally:
            self.unsubscribe(q)


event_bus = EventBus()
