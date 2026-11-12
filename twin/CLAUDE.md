# Twin Layer

The Twin team's layer: the traffic and pedestrian simulation on a hand-built two-block map, the HTTP service around it, the 3D viewer, and mocks of the other two layers.
Started 2026-11-02 from the custom POC engine (see `docs/archive/poc.md`), which was copied in here and then fixed; moved here from `two-blocks-base-simulation/` on 2026-11-08.

## Context Docs (read on demand)

- `docs/engines.md`: every engine (cars, pedestrians, lights, parking, accidents, stations and emergency vehicles, buildings and fires), how it works and where it lives. Read before touching `src/twin/engine/`.
- `docs/fixes-and-changes.md`: what was changed relative to the original POC engine, why, and the before/after numbers. Read before changing behaviour, so a fix is not undone. It is a history and uses the old names.
- `docs/viewer.md`: the 3D viewer, the recording format, coordinates, models and licenses. Read before touching `src/viewer/`.
- `INTERFACE.md`: what the Twin sends and receives. `README.md`: how to run and test.

## Layout

```
src/twin/          service (main, emitter, actuators, devices, timeline, scenario_runs, testbook), city/ seam
src/twin/engine/   the engine package (Simulation in sim.py and its modules)
src/twin/world/    the two-block map, scenario setup, scenarios, recorder
src/viewer/        Vite + React + three.js viewer and timeline; public/models/ has the .glb models with licenses
mocks/             brain/, guardian/ (FastAPI), ui/ (their consoles, one React bundle)
tools/             rule checks, liveness stats, glTF inspector, avoidance comparison
tests/             service tests; tests/engine/ for the engine; incident_chain.py is test support
```

## How to Run

Whole city: `docker compose up --build` from the repository root (ask the user to run it). Commands below are from `twin/` and short-lived:

```bash
uv sync
uv run pytest                                  # about a minute and a half
uv run python -m tools.check_rules             # the movement rules over 3 seeds, with violation counts
uv run python -m tools.motion_smoothness       # car heading snaps and position jumps per scenario
uv run python -m tools.continuity [-v]         # teleports, slides, crabbing, yaw, braking, pop-in per scenario, with causes
uv run python -m tools.liveness                # crossings, waits, trips: proves nothing is frozen
uv run python -m tools.ped_turning             # pedestrians turning on the spot, per scenario (should be 0)
uv run python -m twin.world.record --scenario ped-hit   # writes a recording; viewer ?rec=ped-hit
uv run python -m twin.world.record 150 --scenario building-fire --call-fire-at 20   # a fire, the truck called at 20 s
```

## Key Decisions

- **Engine copied, not shared.** `src/twin/engine/` started as an exact copy of the POC engine (first engine commit on this folder), then changed in separate commits. The POC itself stays local-only and is not in the repo.
- **Positions are front bumpers for vehicles.** `Car.x/y` is the front bumper; `dist_on_edge` is its projection along the lane (IDM gaps are measured that way). Vehicles move by a kinematic bicycle model steered by pure pursuit (`engine/vehicle_dynamics.py`); IDM only sets acceleration. Parked cars follow the same rule. Anything drawing or testing cars must offset backwards by half the car length (4.5 m / 2).
- **One street cross-section** (`engine/street_profile.py`): driving lanes, then a 3 m parking lane, the kerb, a 4 m sidewalk. Cars, parking, pedestrians, crosswalks and the viewer all read it. Change widths there only.
- **Pedestrians live on their own network** (`engine/walk_network.py`), derived from the road graph. They can reach the other side of a street only over a crosswalk.
- **Rules are tested from geometry**, not from engine internals (`tools/check_rules.py`), so the same check runs against any version of the engine.
- **Simulation takes its map as an argument** (`Simulation(graph=...)`). Without one it loads the OSM map of Avenue Habib Bourguiba via `engine/road_network.py` (needs network on first load, then cached in `engine/data/`, git-ignored).

## Working Rules For This Folder

- After any change in `src/twin/engine/`, run `uv run pytest` and `uv run python -m tools.liveness`. A change that passes the rules but drops crossings or trips to zero has frozen the city.
- When fixing a movement bug, first make `tools/check_rules.py` (or a test) show it, then fix it.
- Keep modules small and single-purpose, as the existing ones are (one engine or rule per file, `sim.py` wires them).
- Regenerate the recordings after engine changes; the viewer only shows what was recorded.
- Model files: only add models with a clear license, and note source and license in `src/viewer/public/models/SOURCES.md`.

## Open Items

- Junctions trade throughput for safety (`docs/fixes-and-changes.md` section 11): about 23% fewer car trips than when cars drove through each other, and in a full city (100 pedestrians at the T-junction of node 5) single cars wait up to about 3 minutes. The pedestrian phase (2026-11-08) cut that to about 70 s. Each lane has one queue.

- Look at the viewer in a browser; tune `clipSpeed` in `src/viewer/src/actors/modelCatalog.ts` so feet do not slide.
- Animation polish left: wrecks and the injured pedestrian vanish when a scene is cleared (towing and loading come with dispatch); cars and pedestrians hit stop dead (crash physics step). Cars park forwards; a real parallel park into a 7.5 m gap would reverse in, which the bicycle model does not do yet (about 2.5° left, up to 6° in the first bay after a junction).
- Fires: cars already on a street next to the burning building, or with no other way (most trips on the two-block ring), drive past it. Police sent to a fire close nothing, and the fire never crosses a street (no wind). `fire_risk` defaults to 0, so the default city has no fires of its own. The viewer's fire effects and building selection were only type-checked and unit-tested, not looked at in a browser.
- Rules are verified on the two-block map only. On the OSM map the walk network builds (5157 nodes, 1471 crosswalks, one connected component) and runs, but very short streets could make sidewalk end points overlap. Not measured.
- `engine/places.py` generates 100 places even on this tiny map, including 5 "hospitals"; they no longer get ambulances when the map names its stations.
- A car that follows a red-light runner into a junction is trapped behind the wreck past its stop line, and the rule check counts it under R3 and R5 (car-crash seeds 1, 2, 10). Nobody drives round a wreck yet.
- `Soldier.glb` animation comes from Mixamo; check its license before any public release (see `src/viewer/public/models/SOURCES.md`).

## Notes
