import unittest
from unittest.mock import patch

import requests

from app import create_app


class _MockResponse:
    def __init__(self, json_data, status_code=200):
        self._json_data = json_data
        self.status_code = status_code

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)


class ApiRoutesTests(unittest.TestCase):
    def setUp(self):
        app = create_app({"TESTING": True})
        self.client = app.test_client()

    @patch("app.routes.markets.requests.get")
    def test_events_route_sorts_filters_sports_and_tags(self, mock_get):
        mock_get.return_value = _MockResponse(
            [
                {"id": "1", "title": "Sports event", "tags": ["sports"], "startDateIso": "2026-03-31T00:00:00Z"},
                {"id": "2", "title": "Election event", "tags": ["politics"], "startDateIso": "2026-03-30T00:00:00Z"},
                {"id": "3", "title": "Fed rates", "tags": [], "startDateIso": "2026-03-29T00:00:00Z"},
            ]
        )

        res = self.client.get("/api/markets/events?limit=3&closed=false")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()

        self.assertEqual(len(payload), 2)
        self.assertEqual([e["id"] for e in payload], ["2", "3"])
        self.assertIn("tmCategories", payload[0])
        self.assertIn("Politics", payload[0]["tmCategories"])

    @patch("app.routes.markets.requests.get")
    def test_events_route_returns_502_on_upstream_failure(self, mock_get):
        mock_get.side_effect = requests.RequestException("boom")
        res = self.client.get("/api/markets/events")
        self.assertEqual(res.status_code, 502)
        payload = res.get_json()
        self.assertEqual(payload["events"], [])
        self.assertIn("error", payload)

    def test_chat_route_validates_body(self):
        res = self.client.post("/api/chat", json={})
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    def test_chat_route_requires_api_key(self):
        res = self.client.post("/api/chat", json={"message": "hello"})
        self.assertEqual(res.status_code, 503)
        self.assertIn("missing ANTHROPIC_API_KEY", res.get_json()["error"])

    @patch("app.routes.markets.requests.get")
    def test_trades_analytics_route_returns_analytics_shape(self, mock_get):
        base_ts = 1_700_000_000
        mock_get.return_value = _MockResponse(
            [
                {
                    "size": "10",
                    "price": "0.5",
                    "timestamp": base_ts,
                    "proxyWallet": "A",
                    "conditionId": "M1",
                },
                {
                    "size": "2",
                    "price": "0.5",
                    "timestamp": base_ts - 1800,
                    "proxyWallet": "B",
                    "conditionId": "M2",
                },
            ]
        )

        res = self.client.get("/api/markets/trades-analytics?windowHours=24&limit=100")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertIn("analytics", payload)
        self.assertIn("count", payload)
        self.assertIn("byTime", payload["analytics"])
        self.assertIn("preDeadlineWindow", payload["analytics"])


if __name__ == "__main__":
    unittest.main()
