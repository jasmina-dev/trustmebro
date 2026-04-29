from unittest.mock import MagicMock, patch

import pytest
import requests


def test_chat_requires_message(client):
    res = client.post("/api/chat", json={})
    assert res.status_code == 400
    data = res.get_json()
    assert "message" in data.get("error", "").lower()


def test_chat_rejects_non_list_history(client):
    res = client.post("/api/chat", json={"message": "hi", "history": "nope"})
    assert res.status_code == 400


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "hi", "history": [{"role": "user"}]},
        {"message": "hi", "history": [{"role": "user", "content": ""}]},
        {"message": "hi", "history": [{"role": "narrator", "content": "x"}]},
    ],
)
def test_chat_validates_history_entries(client, payload):
    res = client.post("/api/chat", json=payload)
    assert res.status_code == 400


def test_chat_missing_api_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = client.post("/api/chat", json={"message": "hello"})
    assert res.status_code == 503


@patch("app.routes.markets.requests.get")
def test_get_events_tags_and_returns_list(mock_get, client):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = [
        {
            "id": "evt-1",
            "title": "Fed interest rate decision",
            "startDate": "2026-01-15T12:00:00Z",
            "tags": [],
        }
    ]
    mock_get.return_value = mock_resp

    res = client.get("/api/markets/events?limit=5&closed=false")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert data[0]["id"] == "evt-1"
    assert "Economy" in data[0].get("tmCategories", [])


@patch("app.routes.markets.requests.get")
def test_get_events_upstream_error_returns_502(mock_get, client):
    mock_get.side_effect = requests.RequestException("network")

    res = client.get("/api/markets/events")
    assert res.status_code == 502
    body = res.get_json()
    assert body.get("events") == []


@patch("app.routes.markets.requests.get")
def test_get_events_uses_cached_payload_when_upstream_temporarily_fails(
    mock_get, client
):
    ok_resp = MagicMock()
    ok_resp.raise_for_status = MagicMock()
    ok_resp.json.return_value = [
        {
            "id": "evt-1",
            "title": "Fed interest rate decision",
            "startDate": "2026-01-15T12:00:00Z",
            "tags": [],
        }
    ]
    mock_get.side_effect = [
        ok_resp,
        requests.RequestException("network"),
        requests.RequestException("network"),
        requests.RequestException("network"),
    ]

    first = client.get("/api/markets/events?limit=5&closed=false")
    assert first.status_code == 200
    second = client.get("/api/markets/events?limit=5&closed=false")
    assert second.status_code == 200
    assert second.headers.get("X-Upstream-Cache") == "HIT"
    assert isinstance(second.get_json(), list)


@patch("app.routes.markets.requests.get")
def test_get_markets_uses_cached_payload_when_upstream_temporarily_fails(
    mock_get, client
):
    ok_resp = MagicMock()
    ok_resp.raise_for_status = MagicMock()
    ok_resp.json.return_value = [
        {
            "id": "mkt-1",
            "question": "Will inflation drop below 3%?",
            "tags": [],
        }
    ]
    mock_get.side_effect = [
        ok_resp,
        requests.RequestException("network"),
        requests.RequestException("network"),
        requests.RequestException("network"),
    ]

    first = client.get("/api/markets/markets?limit=5")
    assert first.status_code == 200
    second = client.get("/api/markets/markets?limit=5")
    assert second.status_code == 200
    assert second.headers.get("X-Upstream-Cache") == "HIT"
    assert isinstance(second.get_json(), list)
