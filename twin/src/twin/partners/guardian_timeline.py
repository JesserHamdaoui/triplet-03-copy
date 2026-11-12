"""The Guardian's own events, for the Twin's timeline (R3) and the run logs (R2).

The real Guardian does not answer `GET /events`; it streams every audit event on `WS /v1/ws/timeline` (guardian/README,
adapters/brain_api/ws.py), to whoever is connected, with no history. This keeps a connection open with the Twin's key
(`X-API-Key`, the same TWIN_API_KEY it pushes readings with), reconnects with a pause when it drops, and keeps what it heard
in a ring buffer, translated into the timeline's event format (ts, layer, kind, message, data).

Kept:    verdict      `verdict_issued`, or `verdict_routine` for a periodic sensor's trusted verdict (flagged as chatter)
         containment  `guardian_containment`   a sensor isolated, a device quarantined, a quarantine cleared
         system       `guardian_system`        a threat level changed, a sensor went stale, the Twin was reached or not
         alert        `guardian_alert`         what it tells the City Brain
         error        `guardian_error`         a reading it rejected, a call to the Twin that failed
Dropped: reading (the Twin sent it) and action (the Twin logged the call itself).
Documentation of the client used: https://websockets.readthedocs.io/en/stable/reference/asyncio/client.html
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from typing import Any

from websockets.asyncio.client import connect

log = logging.getLogger("twin.guardian_timeline")

LAYER = "guardian"
STREAM_PATH = "/v1/ws/timeline"
# sensors that report on a clock: a trusted verdict on one is chatter. Calls, anomalies and fires report when something happens.
PERIODIC = {"traffic_camera", "water_level", "rain_gauge", "air_quality", "flow_meter", "power_meter", "grid_meter"}
KEPT = {"containment": "guardian_containment", "system": "guardian_system", "alert": "guardian_alert", "error": "guardian_error"}


def ws_url(guardian_url: str) -> str:
    """The stream's address from the Guardian's base address (http becomes ws, https becomes wss)."""
    if not guardian_url:
        return ""
    base = guardian_url.rstrip("/")
    return ("wss" if base.startswith("https") else "ws") + base[base.index("://"):] + STREAM_PATH


def translate(message: Any, sensor_types: dict[str, str]) -> dict[str, Any] | None:
    """One Guardian event as a timeline event, or None for one the timeline leaves out. `sensor_types` (sensor id to type)
    is filled from the readings the Guardian reports on the way, so a verdict can be told chatter from a report."""
    if not isinstance(message, dict) or "type" not in message or "ts" not in message:
        return None
    kind, sensor_id = message["type"], message.get("sensor_id")
    data = dict(message.get("data") or {})
    if kind == "reading":
        if sensor_id and data.get("sensor_type"):
            sensor_types[sensor_id] = data["sensor_type"]
        return None
    if kind == "verdict":
        periodic = sensor_types.get(sensor_id or "") in PERIODIC
        out_kind = "verdict_routine" if periodic and data.get("status") == "trusted" else "verdict_issued"
    elif kind in KEPT:
        out_kind = KEPT[kind]
    else:
        return None
    data = {**data, "sensor_id": sensor_id, "zone_id": message.get("zone_id"), "actuator_id": message.get("actuator_id")}
    data.pop("kind", None)
    return {"ts": message["ts"], "layer": LAYER, "kind": out_kind, "message": str(message.get("summary", "")), "data": data}


class GuardianTimeline:
    """A standing connection to the Guardian's stream and what it said. `connected` and `error` say how it is doing."""

    def __init__(self, url: str, api_key: str, maxlen: int = 20000, retry_s: tuple[float, float] = (1.0, 30.0)) -> None:
        self.url, self.api_key, self.retry_s = url, api_key, retry_s
        self._events: deque[dict[str, Any]] = deque(maxlen=maxlen)
        self._sensor_types: dict[str, str] = {}
        self.connected = False
        self.ever_connected = False
        self.error: str | None = None

    def events(self) -> list[dict[str, Any]]:
        return list(self._events)

    def _keep(self, event: dict[str, Any]) -> None:
        self._events.append(event)

    async def run(self) -> None:
        """Forever: connect, read until it drops, wait, again. Never raises (a refused key or a Guardian that is not there yet
        is shown in `error` and tried again)."""
        pause = self.retry_s[0]
        headers = {"X-API-Key": self.api_key} if self.api_key else {}
        while True:
            try:
                async with connect(self.url, additional_headers=headers, open_timeout=5) as ws:
                    self.connected = self.ever_connected = True
                    self.error, pause = None, self.retry_s[0]
                    async for raw in ws:
                        try:
                            event = translate(json.loads(raw), self._sensor_types)
                        except ValueError:
                            continue
                        if event is not None:
                            self._keep(event)
                self.error = "the Guardian closed the stream"
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - the feed must outlive any one failure
                self.error = f"{type(exc).__name__}: {exc}"[:200]
                log.warning("guardian timeline: %s", self.error)
            self.connected = False
            await asyncio.sleep(pause)
            pause = min(pause * 2, self.retry_s[1])
