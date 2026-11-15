"""A crosswalk camera is a second witness of a person hit on a crosswalk, whatever the junction cameras see."""
from twin.engine import crosswalk_watch as xw
from twin.world import scenarios
from twin.world.scenario import DT


def test_every_crosswalk_has_a_camera_of_its_own():
    sim = scenarios.build("city").sim
    assert {c.crosswalk_id for c in sim.crosswalk_cameras} == set(sim.walk.crosswalks)
    assert len({c.id for c in sim.crosswalk_cameras}) == len(sim.crosswalk_cameras)


def test_a_casualty_is_flagged_after_the_delay_and_cleared_when_taken_away():
    cam = xw.CrosswalkCamera(id="xwalk-a-cctv", crosswalk_id="a", x=10.0, y=10.0)
    hurt = [{"id": "ped1", "x": 12.0, "y": 10.0}]
    assert xw.update([cam], hurt, 0.0) == []
    assert xw.update([cam], hurt, xw.DETECT_S - 0.1) == []
    raised = xw.update([cam], hurt, xw.DETECT_S)
    assert [a["anomaly_type"] for a in raised] == ["accident"] and raised[0]["camera_id"] == "xwalk-a-cctv"
    assert xw.update([cam], hurt, xw.DETECT_S + 1.0) == []     # raised once, kept while the person lies there
    assert len(cam.anomalies) == 1
    xw.update([cam], [], xw.DETECT_S + 2.0)
    assert cam.anomalies == {}


def test_a_person_far_from_the_crosswalk_is_not_seen():
    cam = xw.CrosswalkCamera(id="xwalk-a-cctv", crosswalk_id="a", x=0.0, y=0.0)
    far = [{"id": "ped1", "x": xw.WATCH_RADIUS_M + 5.0, "y": 0.0}]
    assert xw.update([cam], far, 0.0) == [] and xw.update([cam], far, 10.0) == []


def test_a_pedestrian_hit_gets_a_crosswalk_camera_anomaly_in_the_same_incident():
    sc = scenarios.build("ped-hit", seed=7)
    sim = sc.sim
    for _ in range(int(60 / DT)):
        sc.step()
    accident = next(e for e in sim.timeline if e["kind"] == "incident")
    flagged = [e for e in sim.timeline if e["kind"] == "camera_anomaly" and e["anomaly_type"] == "accident"]
    assert flagged, "no crosswalk camera flagged the person hit"
    assert flagged[0]["camera_id"].startswith("xwalk-") and flagged[0]["t"] >= accident["t"] + xw.DETECT_S - 1e-6
    calls = [e for e in sim.timeline if e["kind"] == "call_started"]
    assert flagged[0]["incident_id"] == calls[0]["incident_id"] if calls else flagged[0]["incident_id"]
