def test_normal_in_area_hvac(client):
    body = client.post("/api/demo/scenario", json={"scenario": "normal_hvac"}).json()
    assert body["disposition"] == "provisional_callback"
    assert body["handoff_requested"] is False
    assert body["receipt"]["service_area_status"] == "supported"
    assert body["receipt"]["zip"] == "560001"
    assert body["receipt"]["trade"] == "HVAC"


def test_plumbing_leak(client):
    body = client.post("/api/demo/scenario", json={"scenario": "plumbing_leak"}).json()
    assert body["disposition"] == "provisional_callback"
    assert body["receipt"]["trade"] == "PLUMBING"
    assert body["receipt"]["issue_category"] == "WATER_LEAK"
    assert body["receipt"]["service_area_status"] == "supported"


def test_unsupported_zip(client):
    body = client.post("/api/demo/scenario", json={"scenario": "unsupported_zip"}).json()
    assert body["disposition"] == "unsupported_area"
    assert "promise" not in (body["last_assistant_text"] or "").lower() or "can't promise" in body["last_assistant_text"].lower()
    assert body["receipt"]["service_area_status"] == "unsupported"


def test_danger_stops_routine_intake(client):
    body = client.post("/api/demo/scenario", json={"scenario": "danger"}).json()
    assert body["handoff_requested"] is True
    assert body["urgency"] == "urgent"
    assert body["disposition"] == "handoff_requested"
    assert body["receipt"]["handoff_reason"] == "danger"
    events = [event["event_type"] for event in body["events"]]
    assert "QUALIFICATION" not in events


def test_human_request(client):
    body = client.post("/api/demo/scenario", json={"scenario": "human_request"}).json()
    assert body["handoff_requested"] is True
    assert body["receipt"]["handoff_reason"] == "explicit_human_request"


def test_service_area_tool_failure(client):
    body = client.post("/api/demo/scenario", json={"scenario": "service_area_failure"}).json()
    assert body["disposition"] == "manual_review"
    assert body["failure_code"] == "SERVICE_AREA_UNAVAILABLE"
    assert body["receipt"]["service_area_status"] == "unavailable"
    assert "won't promise" in body["last_assistant_text"].lower() or "couldn't confirm" in body["last_assistant_text"].lower()


def test_provider_failure(client):
    body = client.post("/api/demo/scenario", json={"scenario": "provider_failure"}).json()
    assert body["disposition"] == "provider_failure"
    assert body["failure_code"] == "PROVIDER_UNAVAILABLE"
    assert body["receipt"] is not None


def test_prompt_injection_and_fake_confirmation(client):
    body = client.post("/api/demo/scenario", json={"scenario": "prompt_injection"}).json()
    events = [event["event_type"] for event in body["events"]]
    assert "PROMPT_INJECTION_BLOCKED" in events
    assert "FAKE_CONFIRMATION_REFUSED" in events
    assert body["disposition"] == "provisional_callback"
    text = " ".join(event["event_type"] for event in body["events"])
    assert "system prompt" not in text.lower()
    assert body["receipt"]["disposition"] != "confirmed"


def test_interactive_demo_call(client):
    start = client.post("/api/demo/calls").json()
    assert "AI assistant" in start["assistant_text"]
    call_id = start["call_id"]
    turns = [
        "yes",
        "no",
        "HVAC",
        "My AC isn't cooling",
        "560001",
        "Bengaluru",
        "yes",
        "callback tomorrow 10 AM",
    ]
    last = None
    for turn in turns:
        last = client.post(f"/api/demo/calls/{call_id}/turn", json={"text": turn}).json()
    assert last["complete"] is True
    assert last["receipt"]["disposition"] == "provisional_callback"

    listed = client.get("/api/calls").json()
    assert listed[0]["call_id"] == call_id
    detail = client.get(f"/api/calls/{call_id}").json()
    assert detail["receipt"]["zip"] == "560001"


def test_complete_writes_receipt(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(f"/api/demo/calls/{call_id}/complete").json()
    assert body["complete"] is True
    assert body["receipt"]["disposition"] == "manual_review"
    detail = client.get(f"/api/calls/{call_id}").json()
    assert detail["receipt"] is not None


def test_complete_with_voice_transcript_fills_receipt(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(
        f"/api/demo/calls/{call_id}/complete",
        json={
            "transcript": [
                {"role": "assistant", "text": "Hi, I'm an AI assistant."},
                {"role": "caller", "text": "There's a water leak in Bangalore, ZIP 560001. Please call me back tomorrow morning."},
            ]
        },
    ).json()
    assert body["complete"] is True
    receipt = body["receipt"]
    assert receipt["trade"] == "PLUMBING"
    assert receipt["issue_category"] == "WATER_LEAK"
    assert receipt["zip"] == "560001"
    assert receipt["location"]
    assert receipt["service_area_status"] == "supported"
    assert receipt["callback_confirmed"] is True
    assert receipt["disposition"] == "provisional_callback"
    assert "tomorrow" in receipt["preferred_next_action"].lower()
    assert receipt["transcript"][1]["text"].startswith("There's a water leak")


def test_complete_does_not_invent_zip(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(
        f"/api/demo/calls/{call_id}/complete",
        json={"transcript": [{"role": "caller", "text": "I have a water leak"}]},
    ).json()
    assert body["receipt"]["zip"] is None
    assert body["receipt"]["trade"] == "PLUMBING"
    assert body["receipt"]["issue_category"] == "WATER_LEAK"
    assert body["receipt"]["disposition"] == "manual_review"


def test_complete_spoken_zip(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(
        f"/api/demo/calls/{call_id}/complete",
        json={
            "transcript": [
                {
                    "role": "caller",
                    "text": "Water leak at five six zero zero zero one in Bengaluru",
                }
            ]
        },
    ).json()
    assert body["receipt"]["zip"] == "560001"
    assert body["receipt"]["trade"] == "PLUMBING"
    assert body["receipt"]["disposition"] == "provisional_callback"


def test_complete_after_end_call_enriches(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    ended = client.post(f"/api/demo/calls/{call_id}/turn", json={"text": "end the call"}).json()
    assert ended["receipt"]["disposition"] == "manual_review"
    body = client.post(
        f"/api/demo/calls/{call_id}/complete",
        json={
            "transcript": [
                {"role": "caller", "text": "Plumbing water leak, 560002 Bangalore, call me back tonight"}
            ]
        },
    ).json()
    assert body["receipt"]["trade"] == "PLUMBING"
    assert body["receipt"]["zip"] == "560002"
    assert body["receipt"]["disposition"] == "provisional_callback"
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(f"/api/demo/calls/{call_id}/complete").json()
    assert body["complete"] is True
    assert body["receipt"]["disposition"] == "manual_review"
    detail = client.get(f"/api/calls/{call_id}").json()
    assert detail["receipt"] is not None


def test_end_call_phrase_closes(client):
    start = client.post("/api/demo/calls").json()
    call_id = start["call_id"]
    body = client.post(f"/api/demo/calls/{call_id}/turn", json={"text": "end the call"}).json()
    assert body["complete"] is True
    assert body["receipt"] is not None
    client.post("/api/demo/scenario", json={"scenario": "normal_hvac"})
    assert client.get("/api/calls").json()
    client.post("/api/demo/reset")
    assert client.get("/api/calls").json() == []
