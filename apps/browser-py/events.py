"""Redis event bridge to the Node backend.

The Python engine publishes execution events on the SAME channel the legacy
Node worker used (`omnitask:worker:events`) with the SAME envelope, so
WorkerEventRelayService (apps/backend) relays them to the socket + DB unchanged.
It also polls the same approval/healing keys the relay writes.
"""

import asyncio
import json
import time

import redis.asyncio as redis

WORKER_EVENT_CHANNEL = "omnitask:worker:events"
PY_JOB_LIST = "omnitask:py:jobs"
PY_ALIVE_KEY = "omnitask:py:alive"


def now_ms() -> int:
    return int(time.time() * 1000)


class EventPublisher:
    """Publishes envelope `{ sessionId, event, data, timestamp }` to Redis."""

    def __init__(self, client: "redis.Redis"):
        self.client = client

    async def publish(self, session_id: str, event: str, data: dict | None = None) -> None:
        envelope = {
            "sessionId": session_id,
            "event": event,
            "data": data or {},
            "timestamp": now_ms(),
        }
        try:
            await self.client.publish(WORKER_EVENT_CHANNEL, json.dumps(envelope))
        except Exception:
            # Never let a telemetry publish failure abort execution.
            pass

    async def wait_for_approval(self, session_id: str, step_index: int, timeout_ms: int) -> bool:
        """Poll `omnitask:approval:<sid>:<idx>` for APPROVED/DENIED (set by relay)."""
        key = f"omnitask:approval:{session_id}:{step_index}"
        deadline = now_ms() + timeout_ms
        while now_ms() < deadline:
            value = await self.client.get(key)
            if value == "APPROVED":
                await self.client.delete(key)
                return True
            if value == "DENIED":
                await self.client.delete(key)
                return False
            await asyncio.sleep(1)
        return False

    async def wait_for_healing(self, session_id: str, step_index: int, timeout_ms: int):
        """Poll `omnitask:healing:<sid>:<idx>` for the self-healing JSON verdict."""
        key = f"omnitask:healing:{session_id}:{step_index}"
        deadline = now_ms() + timeout_ms
        while now_ms() < deadline:
            value = await self.client.get(key)
            if value:
                await self.client.delete(key)
                try:
                    return json.loads(value)
                except Exception:
                    return None
            await asyncio.sleep(1)
        return None
