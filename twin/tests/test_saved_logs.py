"""The saved logs a person can open: listed, and read back with the events of their run."""
import asyncio

import httpx

from test_scenario_runs import H, _run_until_done, _world
from twin.saved_logs import list_logs, read_log, write_events

TEXT = """# t2 Car crash at a junction
# started 2026-11-15T03:37:39.527Z, ended: timeout, seed None, run 3
# layer twin: reachable
# layer guardian: NOT reachable, ConnectError: down
2026-11-15T03:38:11.719Z  twin       sim_incident               sim t=225.9: incident
2026-11-15T03:38:12.368Z  guardian   verdict_issued             trusted caller-crossing_car#1 score=1.0
2026-11-15T03:38:12.500Z  city_brain incident_reported          inc-0001 accident
# seen    twin:sim_incident (a car crashes)
# MISSING city_brain:actuator_called (the Brain decides and calls an actuator)
# result: FAIL
"""


def test_a_log_with_text_only_is_read_back_from_its_lines(tmp_path):
    (tmp_path / "t2-20261115T033846Z.log").write_text(TEXT)
    listed = list_logs(str(tmp_path))
    assert [(r["name"], r["scenario"], r["result"], r["rich"]) for r in listed] == [("t2-20261115T033846Z.log", "t2", "FAIL", False)]
    assert listed[0]["title"] == "Car crash at a junction" and listed[0]["started_at"] == "2026-11-15T03:37:39.527Z"

    log = read_log(str(tmp_path), "t2-20261115T033846Z.log")
    assert log["facts"] is False and log["meta"]["result"] == "FAIL" and log["meta"]["run"] == "3"
    assert [(e["layer"], e["kind"]) for e in log["events"]] == [("twin", "sim_incident"), ("guardian", "verdict_issued"), ("city_brain", "incident_reported")]
    assert log["events"][2]["message"] == "inc-0001 accident"
    assert [(c["kind"], c["seen"]) for c in log["checks"]] == [("sim_incident", True), ("actuator_called", False)]
    assert log["layers"]["guardian"]["reachable"] is False and log["layers"]["twin"]["reachable"] is True


def test_a_run_record_beside_the_log_keeps_every_event_with_its_facts(tmp_path):
    log = tmp_path / "t1-20261115T033736Z.log"
    log.write_text(TEXT)
    events = [{"ts": "2026-11-15T03:38:12.368Z", "layer": "guardian", "kind": "verdict_routine", "message": "m", "data": {"status": "trusted"}, "routine": True}]
    write_events(log, {"id": "t1", "result": "PASS"}, {"twin": {"reachable": True, "error": None}}, [], events)
    assert list_logs(str(tmp_path))[0]["rich"] is True
    read = read_log(str(tmp_path), log.name)
    assert read["facts"] is True and read["events"][0]["data"] == {"status": "trusted"} and read["meta"]["result"] == "PASS"


def test_only_plain_log_names_in_the_folder_are_opened(tmp_path):
    (tmp_path / "secret.txt").write_text("no")
    (tmp_path / "t1-20261115T033736Z.log").write_text(TEXT)
    for name in ("../secret.txt", "secret.txt", "..%2Fx.log", "a/b.log", ".hidden.log", "t1-20261115T033736Z.log.bak"):
        assert read_log(str(tmp_path), name) is None
    assert read_log(str(tmp_path), "missing.log") is None and read_log("", "t1.log") is None and list_logs("") == []


def test_a_scenario_run_leaves_a_text_log_and_its_whole_record_that_the_api_serves(monkeypatch, tmp_path):
    twin, brain = _world(monkeypatch, tmp_path)
    last = asyncio.run(_run_until_done(twin, brain, "t1", {"speed": 8}))
    assert last["result"] == "PASS"
    assert (tmp_path / last["log"].replace(".log", ".events.json")).exists()

    async def ask():
        async with httpx.AsyncClient() as client:
            listed = await client.get("http://twin:8000/logs", headers=H)
            one = await client.get(f"http://twin:8000/logs/{last['log']}", headers=H)
            gone = await client.get("http://twin:8000/logs/nothing.log", headers=H)
            nokey = await client.get("http://twin:8000/logs")
            return listed, one, gone, nokey

    listed, one, gone, nokey = asyncio.run(ask())
    assert listed.json()["logs"][0]["name"] == last["log"] and listed.json()["logs"][0]["rich"] is True
    body = one.json()
    assert body["facts"] is True and body["meta"]["result"] == "PASS" and {e["layer"] for e in body["events"]} >= {"twin", "guardian", "city_brain"}
    assert any(e.get("routine") for e in body["events"]) and any(e.get("data") for e in body["events"])
    assert gone.status_code == 404 and nokey.status_code == 401
