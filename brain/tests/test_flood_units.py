"""A flood sends the fire unit and the police when `tactics.flood_units` is on, and only then."""

from brain import config
from brain.config import Policy
from tests.test_conditions import blocked, call, scenario, water
from tests.test_scenarios import play

FLOOD = [water(100, 1.2), water(200, 1.4), call(300, "flood", "call-feed-01", "zone-01"), call(400, "flood", "call-feed-02", "zone-01")]


def units(result):
    return sorted(c["call"]["params"]["unit_type"] for c in result.actuator_calls if c["call"]["action"] == "dispatch_unit")


ON = {"policy": {"tactics": {"flood_units": "on"}}}


async def test_with_the_switch_off_a_flood_sends_no_unit():
    assert units(await play(scenario(FLOOD))) == []


async def test_with_the_switch_on_a_flood_sends_the_fire_unit_and_the_police():
    result = await play(scenario(FLOOD, **ON))

    assert units(result) == ["fire", "police"]
    assert all(c["call"]["trust_ref"].startswith("verdict-") for c in result.actuator_calls)


async def test_a_flood_one_source_reports_still_sends_no_unit():
    result = await play(scenario([water(100, 1.2), water(200, 1.4)], **ON))

    assert units(result) == [] and "evidence" in blocked(result)     # a unit is a medium-impact call: two independent trusted sources


def test_the_switch_is_off_in_the_policy_file_and_one_variable_turns_it_on_for_a_run(monkeypatch):
    monkeypatch.delenv("BRAIN_FLOOD_UNITS", raising=False)
    assert config.load(Policy, "policy").tactics.flood_units == "off"      # the frozen Test Book is measured with it
    monkeypatch.setenv("BRAIN_FLOOD_UNITS", "on")
    assert config.load(Policy, "policy").tactics.flood_units == "on"       # the compose file sets this for the live stack
