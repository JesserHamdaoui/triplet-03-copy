"""Callers are separate reports: each call counts as a voice of its own, the others who report the same thing
corroborate it, and a call judged while it was alone is looked at again when the Brain asks for its verdict."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from guardian.models import ThreatLevel
from tests.conftest import Harness


def _elevate(harness: Harness, zone: str = "zone-07") -> None:
    """In a zone under raised threat every reading needs its corroboration, so a lone call waits for one."""
    harness.g.levels.raise_to(zone, ThreatLevel.elevated, "test")


def _call(envelope: Callable[..., dict[str, Any]], who: str, kind: str = "medical", zone: str = "zone-07", seq: int = 1) -> dict[str, Any]:
    return envelope(f"caller-{who}", "emergency_call", zone, value={"call_id": f"call-{who}", "incident_type": kind, "caller_id": who}, seq=seq)


async def _verdict_of(harness: Harness, who: str) -> dict[str, Any]:
    return (await harness.api("POST", "/v1/verdicts/request", json={"sensor_id": f"caller-{who}", "sequence_no": 1})).json()


async def test_a_lone_call_waits_for_a_second_report(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    _elevate(harness)
    first = (await harness.push(_call(envelope, "a")))[0]
    assert first["status"] == "suspect" and "insufficient_corroboration" in first["reasons"]


async def test_a_second_caller_is_trusted_at_once_and_the_first_when_asked_again(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    _elevate(harness)
    first = (await harness.push(_call(envelope, "a")))[0]
    second = (await harness.push(_call(envelope, "b")))[0]
    assert second["status"] == "trusted"                        # two people, two reports
    again = await _verdict_of(harness, "a")
    assert again["status"] == "trusted" and again["verdict_id"] != first["verdict_id"]
    assert (await harness.api("GET", f"/v1/verdicts/{first['verdict_id']}")).json()["status"] == "suspect"   # the old one stays on record
    assert (await _verdict_of(harness, "a"))["verdict_id"] == again["verdict_id"]                            # and it is not issued anew each time


async def test_many_callers_are_all_trusted_in_the_end(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    _elevate(harness)
    for who in "abcde":
        await harness.push(_call(envelope, who))
    assert {(await _verdict_of(harness, who))["status"] for who in "abcde"} == {"trusted"}


async def test_calls_about_different_things_do_not_corroborate_each_other(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    _elevate(harness)
    await harness.push(_call(envelope, "a", "medical"))
    other = (await harness.push(_call(envelope, "b", "accident")))[0]
    assert other["status"] == "suspect"
    assert (await _verdict_of(harness, "a"))["status"] == "suspect"


async def test_a_camera_that_sees_an_accident_is_a_second_report_for_one_caller(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    _elevate(harness)
    camera = (await harness.push(envelope("xwalk-cw_5_2-cctv", "cctv_anomaly", "zone-07", value={"anomaly_type": "accident", "confidence": 0.85})))[0]
    assert camera["status"] == "trusted"                         # judged on authenticity and context: no neighbour is expected to agree
    caller = (await harness.push(_call(envelope, "a")))[0]
    assert caller["status"] == "trusted"


async def test_the_first_rain_gauge_over_the_line_is_not_doubted_for_being_first(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    """Gauges under one cloud climb together: the first to read over 5 mm/h finds its neighbours a little under it, still rising."""
    zone = "zone-07"
    for i, sensor in enumerate(("rg-a", "rg-b", "rg-c")):
        await harness.push(envelope(sensor, "rain_gauge", zone, value={"rainfall_mm_h": 3.8 + i * 0.01}))
    first = (await harness.push(envelope("rg-a", "rain_gauge", zone, value={"rainfall_mm_h": 5.2}, seq=2)))[0]
    assert first["status"] == "trusted" and "no_neighbour_rainfall_corroboration" not in first["reasons"]


async def test_an_old_camera_verdict_is_renewed_when_asked_after_newer_readings_came(harness: Harness, envelope: Callable[..., dict[str, Any]]) -> None:
    value = {"anomaly_type": "collision", "confidence": 0.9}
    first = (await harness.push(envelope("cam-n2-cctv", "cctv_anomaly", "zone-07", value=value, seq=1)))[0]
    await harness.push(envelope("cam-n2-cctv", "cctv_anomaly", "zone-07", value=value, seq=2))
    await harness.push(envelope("cam-n2-cctv", "cctv_anomaly", "zone-07", value=value, seq=3))
    harness.clock.advance(31)                                       # the first verdict has run out, and it is no longer the latest reading
    again = (await harness.api("POST", "/v1/verdicts/request", json={"sensor_id": "cam-n2-cctv", "sequence_no": 1})).json()
    assert again["verdict_id"] != first["verdict_id"] and again["status"] == "trusted"

