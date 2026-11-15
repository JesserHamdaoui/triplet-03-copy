"""The Twin's events go to the City Brain's timeline; one event it cannot write must not hold the others back."""
import asyncio

from twin.events import EventLog
from twin.partners.brain_timeline import BrainTimeline, to_cloud_event


def test_a_scenario_that_ended_has_a_result_that_is_a_word_not_a_dict():
    cloud = to_cloud_event({"kind": "scenario_ended", "message": "t1 passed", "ts": "2026-11-15T03:37:36Z", "data": {"result": "PASS"}})
    assert cloud["type"] == "twin.scenario_ended" and "subject" not in cloud


def test_an_actuator_answer_names_its_incident_as_before():
    cloud = to_cloud_event({"kind": "actuator_called", "message": "m", "ts": "t", "data": {"result": {"incident_id": "inc-0001"}}})
    assert cloud["subject"] == "inc-0001"


def test_an_event_that_cannot_be_written_is_dropped_and_the_next_one_goes():
    class Client:
        def __init__(self): self.sent = []
        async def post(self, url, json, headers):
            self.sent.append(json["type"])
            return type("R", (), {"status_code": 202, "text": ""})()

    events = EventLog("twin")
    line = BrainTimeline("http://brain/timeline", "", events)
    line._waiting.append({"kind": "bad", "ts": "t", "data": {}})                 # no `message`: it cannot be written
    line._waiting.append({"kind": "good", "message": "m", "ts": "t", "data": {}})
    client = Client()
    asyncio.run(line.flush(client))
    assert client.sent == ["twin.good"] and not line._waiting
