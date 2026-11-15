"""Crosswalk cameras: one over every crosswalk, watching for a person lying on it.

A pedestrian is hit only on a crosswalk (walkers cross the street nowhere else), and the junction cameras
(engine/cameras.py) see about half of the street, so a hit often had no second witness besides its callers.
A crosswalk camera is a sensor of its own, independent of the callers and of the junction cameras:
it flags an `accident` anomaly when a person has lain within WATCH_RADIUS_M of the crosswalk centre for
DETECT_S, and keeps it until the person is taken away. Its reading is a `cctv_anomaly`, the type the
City Brain already turns into an accident incident.

An anomaly's `since_t` is when the camera flagged it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

DETECT_S = 2.0
WATCH_RADIUS_M = 15.0
CONFIDENCE = 0.85


@dataclass
class CrosswalkCamera:
    id: str
    crosswalk_id: str
    x: float
    y: float
    first_seen: dict[str, float] = field(default_factory=dict)   # casualty id -> when it was first seen lying here
    anomalies: dict[str, dict] = field(default_factory=dict)     # casualty id -> anomaly


def sensor_id(crosswalk_id: str) -> str:
    return f"xwalk-{crosswalk_id}-cctv"


def build_crosswalk_cameras(walk) -> list[CrosswalkCamera]:
    """One camera per crosswalk, at the middle of the crosswalk."""
    cams = []
    for cw_id, cw in sorted(walk.crosswalks.items()):
        ax, ay = walk.xy(cw.a)
        bx, by = walk.xy(cw.b)
        cams.append(CrosswalkCamera(id=sensor_id(cw_id), crosswalk_id=cw_id, x=round((ax + bx) / 2, 2), y=round((ay + by) / 2, 2)))
    return cams


def update(cams: list[CrosswalkCamera], casualties: list[dict], t: float) -> list[dict]:
    """`casualties`: dicts with id, x, y, one per person lying hurt. Returns the anomalies raised this tick."""
    raised = []
    for cam in cams:
        here = {c["id"]: c for c in casualties if math.hypot(c["x"] - cam.x, c["y"] - cam.y) <= WATCH_RADIUS_M}
        cam.first_seen = {cid: cam.first_seen.get(cid, t) for cid in here}
        current = {}
        for cid, c in here.items():
            if t - cam.first_seen[cid] < DETECT_S:
                continue
            old = cam.anomalies.get(cid)
            if old:
                current[cid] = old
                continue
            anomaly = {"anomaly_id": f"{cam.id}-{cid}-accident", "anomaly_type": "accident", "confidence": CONFIDENCE,
                       "person_id": cid, "x": round(c["x"], 1), "y": round(c["y"], 1), "since_t": round(t, 2)}
            current[cid] = anomaly
            raised.append({"camera_id": cam.id, **anomaly})
        cam.anomalies = current
    return raised
