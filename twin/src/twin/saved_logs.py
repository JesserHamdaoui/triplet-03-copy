"""The logs a person can open: every file in the log folder, with the events of its run.

A scenario run writes `<id>-<UTC time>.log` (R2: the readable text) and now also `<id>-<UTC time>.events.json` beside it,
with every event of the three layers as it was, facts and routine chatter included, so the screen can open it later with
nothing lost. A `.log` without that file (an older run) is read back from its text lines: when, which layer, what kind
of event and its message, but no facts."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.log$")
LINE = re.compile(r"^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(\S+)\s+(\S+)\s*(.*)$")
CHECK = re.compile(r"^# (seen|MISSING)\s+(\S+?):(\S+) \((.*)\)$")
STARTED = re.compile(r"^# started (\S+), ended: (\S+), seed (\S+), run (\S+)")
LAYER = re.compile(r"^# layer (\S+): (reachable|NOT reachable.*)$")
RUN = re.compile(r"^(?P<scenario>[a-z]+\d+)-(?P<stamp>\d{8}T\d{6}Z)\.log$")
ROUTINE_KINDS = {"reading_emitted", "readings_verified", "verdict_routine"}


def events_file(log: Path) -> Path:
    return log.with_name(log.name.removesuffix(".log") + ".events.json")


def write_events(log: Path, meta: dict[str, Any], layers: dict[str, Any], checks: list[dict[str, Any]], events: list[dict[str, Any]]) -> None:
    """The run's whole record beside its text log."""
    events_file(log).write_text(json.dumps({"meta": meta, "layers": layers, "checks": checks, "events": events}, default=str), encoding="utf-8")


def _summary(path: Path) -> dict[str, Any]:
    found = RUN.match(path.name)
    head: dict[str, Any] = {"name": path.name, "kind": "scenario" if found else "other", "scenario": found["scenario"] if found else None,
                            "stamp": found["stamp"] if found else None, "bytes": path.stat().st_size, "result": None, "started_at": None,
                            "ended": None, "title": None, "rich": events_file(path).exists()}
    try:
        with path.open(encoding="utf-8") as handle:
            for number, line in enumerate(handle):
                if number == 0 and line.startswith("# "):
                    head["title"] = line[2:].strip().split(" ", 1)[-1] if found else line[2:].strip()
                elif line.startswith("# started") and (m := STARTED.match(line)):
                    head["started_at"], head["ended"] = m[1], m[2]
                elif line.startswith("# result:"):
                    head["result"] = line.split(":", 1)[1].strip()
    except OSError:
        pass
    head.setdefault("title", None)
    return head


def list_logs(folder: str) -> list[dict[str, Any]]:
    """The `.log` files of the folder, newest first."""
    root = Path(folder) if folder else None
    if root is None or not root.is_dir():
        return []
    rows = [_summary(p) for p in root.iterdir() if p.is_file() and NAME.match(p.name)]
    return sorted(rows, key=lambda r: (r["stamp"] or "", r["name"]), reverse=True)


def _parse_text(text: str) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    layers: dict[str, Any] = {}
    checks: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    for line in text.splitlines():
        if m := LINE.match(line):
            ts, layer, kind, message = m.groups()
            events.append({"ts": ts, "layer": layer, "kind": kind, "message": message.strip(), "routine": kind in ROUTINE_KINDS})
        elif m := CHECK.match(line):
            checks.append({"layer": m[2], "kind": m[3], "meaning": m[4], "seen": m[1] == "seen"})
        elif m := STARTED.match(line):
            meta.update(started_at=m[1], ended=m[2], seed=m[3], run=m[4])
        elif m := LAYER.match(line):
            layers[m[1]] = {"reachable": m[2] == "reachable", "error": None if m[2] == "reachable" else m[2]}
        elif line.startswith("# result:"):
            meta["result"] = line.split(":", 1)[1].strip()
        elif line.startswith("# ") and "title" not in meta and not line.startswith(("# started", "# layer", "# seen", "# MISSING", "# result")):
            first, _, rest = line[2:].strip().partition(" ")
            meta.update(id=first, name=rest or first, title=rest or first)
    return {"meta": meta, "layers": layers, "checks": checks, "events": events}


def read_log(folder: str, name: str) -> dict[str, Any] | None:
    """One log with its events; None when there is no such log. Only plain file names in the folder are opened."""
    if not folder or not NAME.match(name):
        return None
    path = Path(folder) / name
    if not path.is_file():
        return None
    record: dict[str, Any] | None = None
    side = events_file(path)
    if side.is_file():
        try:
            record = json.loads(side.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            record = None
    if record is None:
        record = {**_parse_text(path.read_text(encoding="utf-8", errors="replace")), "facts": False}
    else:
        record["facts"] = True
    return {"name": name, **record}
