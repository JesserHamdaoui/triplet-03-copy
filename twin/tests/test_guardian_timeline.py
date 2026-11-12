"""The Guardian's own events on the Twin's timeline: its WS /v1/ws/timeline, translated into the timeline's event format
(ts, layer, kind, message, data), with the one a run's check looks for (`verdict_issued`) and the periodic chatter flagged."""
import asyncio
import json

from websockets.asyncio.server import serve
from websockets.datastructures import Headers
from websockets.http11 import Response

from twin.partners.guardian_timeline import GuardianTimeline, translate, ws_url
from twin.timeline import collect, is_routine
from twin.events import EventLog


def _event(kind, summary="", sensor_id=None, **data):
    return {"event_id": "evt-1", "ts": "2026-11-09T10:00:00.000Z", "type": kind, "scenario_id": None, "sensor_id": sensor_id,
            "actuator_id": None, "zone_id": "zone-03", "summary": summary, "data": {"kind": kind, **data}}


def _verdict(sensor_id, status="trusted", reasons=()):
    return _event("verdict", f"{status} {sensor_id}#3 score=1.0", sensor_id, verdict_id="verdict-1", status=status,
                  trust_score=1.0 if status == "trusted" else 0.5, reasons=list(reasons), action_taken=None, threat_level="normal")


def test_the_url_of_the_stream_comes_from_the_guardians_base_url():
    assert ws_url("http://guardian:8003") == "ws://guardian:8003/v1/ws/timeline"
    assert ws_url("https://guardian.example/") == "wss://guardian.example/v1/ws/timeline"
    assert ws_url("") == ""


def test_a_verdict_on_a_report_is_a_visible_verdict_issued_and_one_on_a_periodic_sensor_is_routine():
    kinds = {}
    translate(_event("reading", "caller-ped1#1 {}", "caller-ped1", sensor_type="emergency_call", sequence_no=1, value={}), kinds)
    translate(_event("reading", "cam-n2#1 {}", "cam-n2", sensor_type="traffic_camera", sequence_no=1, value={}), kinds)
    call = translate(_verdict("caller-ped1"), kinds)
    camera = translate(_verdict("cam-n2"), kinds)
    assert call["kind"] == "verdict_issued" and call["layer"] == "guardian" and not is_routine(call)
    assert call["message"] == "trusted caller-ped1#3 score=1.0" and call["ts"] == "2026-11-09T10:00:00.000Z"
    assert call["data"]["sensor_id"] == "caller-ped1" and call["data"]["status"] == "trusted"
    assert camera["kind"] == "verdict_routine" and is_routine(camera)


def test_a_verdict_that_doubts_a_sensor_is_never_routine_and_keeps_its_reasons():
    kinds = {"cam-n2": "traffic_camera"}
    doubted = translate(_verdict("cam-n2", "suspect", ["no_neighbour_congestion_corroboration"]), kinds)
    assert doubted["kind"] == "verdict_issued" and not is_routine(doubted)
    assert doubted["data"]["reasons"] == ["no_neighbour_congestion_corroboration"]
    assert translate(_verdict("never-seen"), {})["kind"] == "verdict_issued"          # a type it does not know stays visible


def test_containment_threat_alert_and_error_events_are_kept_and_the_rest_is_dropped():
    assert translate(_event("containment", "isolate_sensor cam-n2 (spoofing)", "cam-n2"), {})["kind"] == "guardian_containment"
    assert translate(_event("system", "threat level zone-03: normal → elevated"), {})["kind"] == "guardian_system"
    assert translate(_event("alert", "spoofing: isolate"), {})["kind"] == "guardian_alert"
    assert translate(_event("error", "reading rejected: bad_hmac: x"), {})["kind"] == "guardian_error"
    assert translate(_event("action", "twin isolate_sensor cam-n2: isolated"), {}) is None       # the Twin logged that call itself
    failed = translate(_event("error", "twin isolate_sensor cam-n2 failed; enforced locally only"), {})
    assert failed["kind"] == "guardian_error"
    assert translate(_event("reading", "cam-n2#1 {}", "cam-n2", sensor_type="traffic_camera"), {}) is None   # the Twin sent it
    assert translate({"nonsense": True}, {}) is None


async def _serve(handler, accept_key="k"):
    def check(connection, request):
        if request.headers.get("X-API-Key") != accept_key:
            return Response(403, "Forbidden", Headers(), b"no")
        return None
    return await serve(handler, "127.0.0.1", 0, process_request=check)


def _url(server):
    return f"ws://127.0.0.1:{server.sockets[0].getsockname()[1]}/v1/ws/timeline"


async def _until(predicate, seconds=5.0):
    for _ in range(int(seconds / 0.02)):
        if predicate():
            return True
        await asyncio.sleep(0.02)
    return False


def test_the_feed_connects_with_the_twins_key_and_keeps_what_the_guardian_says():
    async def scenario():
        async def handler(ws):
            await ws.send(json.dumps(_event("reading", "caller-ped1#1 {}", "caller-ped1", sensor_type="emergency_call")))
            await ws.send(json.dumps(_verdict("caller-ped1")))
            await asyncio.sleep(5)
        server = await _serve(handler)
        feed = GuardianTimeline(_url(server), "k", retry_s=(0.05, 0.1))
        task = asyncio.create_task(feed.run())
        assert await _until(lambda: len(feed.events()) == 1)
        task.cancel()
        server.close()
        return feed
    feed = asyncio.run(scenario())
    assert [e["kind"] for e in feed.events()] == ["verdict_issued"] and feed.ever_connected


def test_a_refused_key_is_reported_and_never_crashes_the_feed():
    async def scenario():
        async def handler(ws):
            await asyncio.sleep(5)
        server = await _serve(handler, accept_key="right")
        feed = GuardianTimeline(_url(server), "wrong", retry_s=(0.05, 0.1))
        task = asyncio.create_task(feed.run())
        assert await _until(lambda: feed.error is not None)
        alive = not task.done()
        task.cancel()
        server.close()
        return feed, alive
    feed, alive = asyncio.run(scenario())
    assert alive and not feed.connected and not feed.ever_connected and "403" in feed.error


def test_the_feed_reconnects_when_the_guardian_goes_away_and_keeps_what_it_had():
    async def scenario():
        seen = []

        async def handler(ws):
            seen.append(1)
            await ws.send(json.dumps(_verdict(f"caller-{len(seen)}")))
            if len(seen) == 1:
                await ws.close()
                return
            await asyncio.sleep(5)
        server = await _serve(handler)
        feed = GuardianTimeline(_url(server), "k", retry_s=(0.05, 0.1))
        task = asyncio.create_task(feed.run())
        assert await _until(lambda: len(feed.events()) == 2)
        task.cancel()
        server.close()
        return feed
    feed = asyncio.run(scenario())
    assert [e["data"]["sensor_id"] for e in feed.events()] == ["caller-1", "caller-2"]


def test_the_timeline_uses_the_feed_for_the_guardian_and_falls_back_to_its_events_route_before_it_ever_connected():
    feed = GuardianTimeline("ws://nowhere", "k")
    feed.error = "ConnectionRefusedError"
    feed._keep({"ts": "2026-11-09T10:00:00.000Z", "layer": "guardian", "kind": "verdict_issued", "message": "m", "data": {}})
    own = EventLog("twin")
    answer = asyncio.run(collect(own, {"guardian": ""}, feeds={"guardian": feed}))
    assert [e["kind"] for e in answer["events"]] == ["verdict_issued"]
    assert answer["layers"]["guardian"] == {"reachable": False, "error": "ConnectionRefusedError"}
    feed.ever_connected = False
    feed._events.clear()
    answer = asyncio.run(collect(own, {"guardian": ""}, feeds={"guardian": feed}))
    assert answer["layers"]["guardian"]["error"] == "not configured"        # no stream ever and no events route either
