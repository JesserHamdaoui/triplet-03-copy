# What the Twin Needs From the Other Teams

Everything the Twin can do alone is done.
These changes live in the other teams' folders or in shared root files, so they are theirs to make.
Each was tried on a private copy of that team's configuration, except where noted.

## Guardian

**Required.** Without these the Guardian cannot judge the Twin's sensors, and the City Brain will not act.

Add to `config/city_model.yaml`, under `zones`. The Twin's `zone-03` replaces the current hospital district of that name.

```yaml
zone-01: {type: city_block, has_water_body: false, max_water_level_m: 0.0, has_buildings: true, road_access: true, fire_possible: true, hospital: false, switchable_grid: true, max_vehicles: 60}
zone-02: {type: city_block, has_water_body: false, max_water_level_m: 0.0, has_buildings: true, road_access: true, fire_possible: true, hospital: false, switchable_grid: true, max_vehicles: 60}
zone-03: {type: streets, has_water_body: true, max_water_level_m: 1.5, has_buildings: true, road_access: true, fire_possible: true, hospital: true, switchable_grid: false, max_vehicles: 100}
# one per street: zone-dip-1-2, zone-dip-1-4, zone-dip-2-3, zone-dip-2-5, zone-dip-3-6, zone-dip-4-5, zone-dip-5-6
zone-dip-2-3: {type: street_drain, has_water_body: true, max_water_level_m: 1.5, has_buildings: false, road_access: true, fire_possible: false, hospital: false, switchable_grid: false, max_vehicles: 100}
```

Add to `config/crosschecks.yaml`, under `adjacency`:

```yaml
zone-01: [zone-02, zone-03]
zone-02: [zone-01, zone-03]
zone-03: [zone-01, zone-02, zone-dip-1-2, zone-dip-1-4, zone-dip-2-3, zone-dip-2-5, zone-dip-3-6, zone-dip-4-5, zone-dip-5-6]
zone-dip-2-3: [zone-03, zone-dip-1-2, zone-dip-1-4, zone-dip-2-5, zone-dip-3-6, zone-dip-4-5, zone-dip-5-6]   # likewise for each drain
```

Add to `config/sensor_registry.yaml`, under `sensor_types`:

```yaml
cctv_anomaly: {expected_interval_s: null, fields: {anomaly_type: {type: str}, confidence: {type: float}}, checks: [semantic]}
building_fire: {expected_interval_s: null, fields: {building_id: {type: str}, smoke_detected: {type: bool}, temp_c: {type: float}, co2_ppm: {type: float}}, checks: [semantic]}
unit_status: {expected_interval_s: null, fields: {unit_id: {type: str}, incident_id: {type: str}, state: {type: str}}, checks: [semantic]}
```

Then the Twin sends them with `GUARDIAN_EXTENDED_TYPES=cctv_anomaly,building_fire,unit_status`.

**Wanted, not tried.**

- Allow one dispatch per unit type on an incident. `no_duplicate_dispatch` blocks a second dispatch for the same incident, so an ambulance and a police car cannot both go.
- Send `X-API-Key` on calls to the Twin's `POST /tools/{action}`. The door is open today, because the Guardian's client sends no key.

## City Brain

**Required.** In `deploy/compose/partners.compose.yaml`, or a new file the root stack uses:

```yaml
twin: {adapter: mcp, url: http://twin:8001/mcp, hmac_secret_env: TWIN_HMAC_SECRET, require_signature: true}
guardian: {adapter: v1, url: http://guardian:8003, api_key_env: BRAIN_API_KEY, hmac_secret_env: GUARDIAN_HMAC_KEY, dispatcher_id: dispatch-central, gateway: true, mode: sidecar}
```

**Wanted, not tried.**

- Teach the disaster department the Twin's `set_pump_state`. It asks for a valve, which this city does not have, so nothing drains a flood.

## Found in the per-reporter runs (2026-11-09)

All four scenarios were run on the whole stack, in the order T1 to T4, and every reporter was followed from the Twin to the Guardian's verdict to the City Brain's incident and action.
Every pedestrian and driver is now a sensor of its own (`caller-<id>`), so two callers are two independent sources for the City Brain.
The Twin's own causes of distrust were fixed: a steady queue read as a frozen camera, a repeated `call_id` called a duplicate, and a repeated dispatch answered without `eta_s`.
What is left is on the other teams' side.

**Guardian**

- A storm that starts after a dry spell is judged an attack, and T4 then dispatches nothing. Once a rain gauge has 20 dry readings, `zscore_outlier` (limit 4, `noise_floor` 0.5) fires for any rain above about 2 mm/h, however slowly it arrives. A gauge that fails it and also fails `no_neighbour_rainfall_corroboration` (the first gauges to cross 5 mm/h see neighbours that have not crossed yet) scores 0.2, which is `untrusted` and counts as spoofing. The gauges are isolated, the flow meter and the water level of the flooded drain follow, `zone-03` goes to `under_attack`, and every flood caller becomes `suspicious`. A fresh Guardian does not do this, so the result depends on how long the gauges were dry.
- Tested on a private copy of `config/`, with the Twin's real readings replayed through the Guardian's own pipeline (a 300 s dry spell, then the flood scenario): these four changes together leave nothing isolated, `zone-03` and the drains `normal`, and every water level, flow meter and nearly every gauge reading trusted (two gauges `suspect` with `insufficient_corroboration` at the first crossing). Without them five gauges are `untrusted` at 21 s into the flood and `zone-03` ends `under_attack`.
  - `thresholds.yaml`, `fields`: `rain_gauge.rainfall_mm_h.noise_floor` 0.5 to 15, `water_level.level_m.noise_floor` 0.01 to 0.1, `flow_meter.flow_rate_m3s.noise_floor` 0.05 to 0.3.
  - `crosschecks.yaml`, `rules.rain_gauge`: add `presence_only: true` to the `neighbour_rainfall` source, so a neighbour that has no rain yet is not a vote against.
  - Each rain change alone stops the gauges' cascade, but the drain's water level and flow meter were still isolated until the water and flow floors were raised too. The Twin changed nothing for this: damping the flow meter or raising the flooded street's water reading above 1.2 m made no difference.
- Smoke that clears may also look like an attack: `aq-zone-01` was isolated for `rate_of_change` in the first seconds of the run after a fire. Only seen in the T3 to T4 order.
- Nothing needed for the timeline: the Twin reads the Guardian's events from `WS /v1/ws/timeline` (with `TWIN_API_KEY`). That stream has no history, so the Twin only sees what happens while it is connected; a `GET /events` with recent events would let a Twin that starts late catch up.

**City Brain**

- A crash gets an ambulance but no police car, and the Twin's T2 expects both and a street closure. The accident goes to the medical department only.
- A flood with a trapped driver and pedestrian gets an alert and a pump but no fire truck or police car, and the Twin's T4 expects both. The pump it started was `pump-1-2`, not the one of the flooded street.
- `set_signal_phase` is blocked with `no signal controller in reach` on every jam, because the Twin lists no signal controllers.
- After the Twin restarts, the Brain appeared to stop reading: no `/readings` or MCP calls reached the Twin for six minutes, until the Brain was restarted too.
- After a restart of the Guardian alone, the Brain answered `guardian_unavailable` on every reading for more than ten minutes. It seems to re-read the Twin's retained log and wait out the verdict deadline on readings the new Guardian never saw. Starting all three layers together, Guardian first, avoided it.
- Fire callers that the Guardian trusts are not joined to the incident the Brain opened from the cameras' smoke, so a fire is dispatched on one camera plus a broadcast and not on its callers.

## Root files (the whole triplet)

- `.env.example`: add `TWIN_API_KEY`, `BRAIN_API_KEY`, `OPS_API_KEY` and `GUARDIAN_HMAC_KEY`. The Guardian refuses to start without an API key, and the Twin and the City Brain must share these.
- `docker-compose.yml`: pass those to the `twin`, `guardian` and `brain` services, and `GUARDIAN_EXTENDED_TYPES` to `twin`. Add a `viewer` service for the 3D city (`build: ./twin/src/viewer`, `TWIN_URL: http://twin:8001`, `TWIN_OPERATOR_KEY`) and pass the same `TWIN_OPERATOR_KEY` to `twin`.
- `TESTBOOK.md`: it is generated from `brain/scenarios/`. Agree IDs for the Twin's four scenarios, for example T17 to T20, and a way in.
- `INTEGRATION.md`: the protocol and failure sections are still empty. [`INTEGRATION-twin.md`](INTEGRATION-twin.md) has the Twin's part.

## Not yet covered by anyone

The Guardian's Test Book scenarios T1 to T11 need the Twin to emit fake readings, replays, stuck sensors, silence, call floods and actuators with no effect.
The City Brain's T14 and T16 need `citizen_activity` readings and a crime on camera.
The Twin does none of these yet. They are the next work on the Twin's side.
