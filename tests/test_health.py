def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["service_area"] is True


def test_service_area_supported(client):
    response = client.get("/api/service-area", params={"zip": "560001"})
    assert response.json()["status"] == "supported"


def test_service_area_unsupported(client):
    response = client.get("/api/service-area", params={"zip": "999999"})
    assert response.json()["status"] == "unsupported"


def test_voice_config_endpoint(client):
    body = client.get("/api/demo/voice").json()
    assert "enabled" in body
    assert body["mode"] in {"vapi", "typed"}
    if body["enabled"]:
        assert body["publicKey"] or body["assistantId"] or body["assistant"]
