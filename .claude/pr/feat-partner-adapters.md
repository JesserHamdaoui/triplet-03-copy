This brings the Twin layer into the triplet repository and connects it to the real City Brain and Guardian through their own contracts. The Twin serves the City Brain over MCP and plain HTTP and pushes readings to the Guardian in its contract 1.0, from one canonical reading. With all three real layers running as local processes, the pedestrian hit, car crash and building fire scenarios ran from reading to closed incident, and the flood opened once with a public alert. Those runs used a Guardian configuration that knows the Twin's zones and sensor types, so the root stack needs the changes in `twin/docs/partner-requests.md`.

## The Twin layer in `twin/`

The engine, service, 3D viewer, mocks and tests are added under `twin/`, with a compose file that runs the layer alone with its mocks (R1). Scenario triggers and the Twin's Test Book live in `twin/` too, because the root files are shared. Test runs no longer write chain logs into the shared `logs/` folder, which is for scenario runs.

Commits: `feat(twin): add the Twin layer: engine, service, viewer, mocks and tests`; `feat(twin): run the layer alone from twin/ with its compose file, scenario triggers and Test Book`; `fix(twin): keep incident chain test logs out of the triplet's logs folder`

## One actuation core and the City Brain's carriers

Actuator checks moved into one module that every door calls, so idempotency, trust rules and events are the same for everyone. `twin/src/twin/partners/` serves the City Brain's `GET /readings`, `GET /topology`, `GET /capabilities` and `POST /actuators/{action}`, and the same operations as MCP tools at `/mcp`. Its signed calls are verified, and a call stamped too far from now is refused. Because the City Brain numbers its own incidents, its ids are linked to the Twin's open incidents, and units report `unit_status` with its id, which is how it closes an incident. The City Brain's own conformance checker ran against this door with 8 passed, 1 warning and 0 failed, before `recall_unit` was added; that warning was about `recall_unit`.

Commits: `refactor(twin): move actuator call checks into one actuation module every door can use`; `feat(twin): dispatch from a named station, broadcast public alerts and report unit status`; `feat(twin): address stations as facilities and send no unit from a quarantined one`; `feat(twin): speak the City Brain's and the Guardian's contracts through partner adapters`; `feat(twin): recall a unit unless it is at work a stand-down would abandon`; `feat(twin): put the Twin's events on the City Brain's timeline screen`

## The Guardian's contract

Readings go to `POST /v1/readings` in batches with exactly the fields of its registry, and its calls are answered at `POST /tools/{action}` in its reply shape. The City Brain is offered only readings the Guardian can judge, because a reading with no verdict costs it the whole verdict deadline and puts it in degraded mode. Types the stock registry lacks are sent once named in `GUARDIAN_EXTENDED_TYPES`. Replaying about 13,000 readings through the Guardian's real validator gave no schema errors.

Commits: `fix(twin): offer the City Brain only readings the Guardian can judge, and send our extra types once it registers them`

## Readings an honest sensor would send

Three-layer runs showed honest readings judged as spoofing, and a feed faster than the City Brain could judge. Sensors now report at the intervals the Guardian's registry expects. Rain, air and cameras report means over a window with small noise, and the water level is a damped gauge in the drain shaft, with road depth kept as its own field. The call centre forwards at most 2 calls per incident and 5 per zone each minute. One cloud and one plume cover the small map, each block has a pole camera, and each street's drain has its own zone, so a dry street cannot close a flood on another. Crash witnesses now report `medical`, because the City Brain reads a `police` call as a crime.

Commits: `feat(twin): report each sensor at the interval the Guardian expects, so the City Brain keeps up`; `fix(twin): have crash witnesses ask for an ambulance, since the City Brain reads a police call as a crime`; `feat(twin): model what a real sensor reports and cap what the call centre forwards`; `feat(twin): add block cameras and a zone per street drain, and read rain and smoke across the map`

## Mocks on the real contracts

The mock Guardian and mock City Brain now use the partners' real routes, so running `twin/` alone exercises what the real layers use, and the Twin's earlier private format is gone. The mock City Brain still sends actions to `POST /actuators/call`, because its console works with the Twin's incident ids. `docker compose up` from `twin/` has not been run since this change; the suite covers these paths in process.

Commits: `refactor(twin): put the mocks on the partners' real contracts and drop the old private format`; `chore(twin): serve on port 8001 as the triplet expects and give the mocks the real layers' ports`

## Tests and dependencies

The full suite passes with 366 passed, 1 skipped and 3 expected failures. New tests cover both partner doors, the dialect, the sensor model and the reporting intervals, and use the partners' published known answers for signatures. This adds `mcp` 2.3.0, the version the City Brain locks, for the MCP carrier: [Python SDK documentation](https://py.sdk.modelcontextprotocol.io/), sections on tools, structured output, handling errors, ASGI and deployment.

Commits: `chore(deps): add mcp to the Twin`; `docs(twin): describe the partner contracts the Twin speaks in its Interface Card`; `docs(twin): record the three-layer runs and what the Twin needs from the other teams`

## Needed from the other teams and what is not shown

`twin/docs/partner-requests.md` lists the exact changes for the Guardian, the City Brain and the root files; without the Guardian's, the City Brain will not send a unit. The runs were local processes, not the root `docker-compose.yml`, and the City Brain used its built-in rules with no LLM. The pedestrian and crash scenarios were not re-run on the final code, and the final rain gauge zones were replayed through the Guardian only: `twin/docs/joint-run-2026-11-08.md` has the details. A flood gets an alert but no pump, because the City Brain has no action for it. The Twin cannot yet emit the fake readings, replays, silence or crime the Guardian's and City Brain's Test Book scenarios need.
