import unittest
import os
from unittest.mock import patch
from datetime import datetime, timezone

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


def _http_error(status_code: int) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = status_code
    return requests.HTTPError(response=response)


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

    @patch("app.routes.markets.requests.get")
    def test_trades_analytics_pages_offsets_by_1000(self, mock_get):
        now_ts = int(datetime.now(timezone.utc).timestamp())
        page_one = [
            {
                "transactionHash": f"tx-{i}",
                "size": "1",
                "price": "0.5",
                "timestamp": now_ts - 60,
                "proxyWallet": "A",
                "conditionId": "M1",
            }
            for i in range(1000)
        ]
        page_two = [
            {
                "transactionHash": "tx-1000",
                "size": "1",
                "price": "0.5",
                "timestamp": now_ts - 120,
                "proxyWallet": "B",
                "conditionId": "M2",
            }
        ]
        mock_get.side_effect = [
            _MockResponse(page_one),
            _MockResponse(page_two),
        ]

        res = self.client.get("/api/markets/trades-analytics?windowHours=24&user=0xabc")
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertEqual(payload["count"], 1001)
        self.assertEqual(payload["analytics"]["totalTrades"], 1001)

        offsets = []
        for call in mock_get.call_args_list:
            params = call.kwargs.get("params") or {}
            if "offset" in params:
                offsets.append(int(params["offset"]))

        self.assertGreaterEqual(len(offsets), 2)
        self.assertEqual(offsets[0], 0)
        self.assertEqual(offsets[1], 1000)

    @patch("app.routes.markets.requests.get")
    def test_trades_analytics_debug_payload_contains_intake_diagnostics(self, mock_get):
        now_ts = int(datetime.now(timezone.utc).timestamp())
        mock_get.side_effect = [
            _MockResponse(
                [
                    {
                        "transactionHash": "tx-1",
                        "size": "3",
                        "price": "0.4",
                        "timestamp": now_ts - 30,
                        "proxyWallet": "A",
                        "conditionId": "M1",
                    }
                ]
            )
        ]

        res = self.client.get(
            "/api/markets/trades-analytics?windowHours=24&debug=1&user=0xabc"
        )
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()

        self.assertIn("debug", payload)
        debug = payload["debug"]
        self.assertEqual(debug["source"], "polymarket")
        self.assertEqual(debug["windowHours"], 24)
        self.assertEqual(debug["tradesInWindow"], 1)
        self.assertIn("globalPaging", debug)
        self.assertEqual(debug["globalPaging"]["offsets"][0], 0)
        self.assertEqual(debug["globalPaging"]["pagesFetched"], 1)
        self.assertEqual(debug["globalPaging"]["rowsFetched"], 1)
        self.assertEqual(debug["globalPaging"]["stopReason"], "short_page")
        self.assertIn("timeRange", debug)
        self.assertIsNotNone(debug["timeRange"])

    @patch("app.routes.markets.requests.get")
    def test_trades_analytics_ignores_offset_rejected_page(self, mock_get):
        now_ts = int(datetime.now(timezone.utc).timestamp())
        page_one = [
            {
                "transactionHash": f"tx-{i}",
                "size": "1",
                "price": "0.5",
                "timestamp": now_ts - 60,
                "proxyWallet": "A",
                "conditionId": "M1",
            }
            for i in range(1000)
        ]
        page_two = [
            {
                "transactionHash": f"tx2-{i}",
                "size": "1",
                "price": "0.5",
                "timestamp": now_ts - 120,
                "proxyWallet": "B",
                "conditionId": "M2",
            }
            for i in range(1000)
        ]

        mock_get.side_effect = [
            _MockResponse(page_one),
            _MockResponse(page_two),
            _http_error(400),
        ]

        res = self.client.get(
            "/api/markets/trades-analytics?windowHours=24&debug=1&user=0xabc"
        )
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertEqual(payload["count"], 2000)
        self.assertEqual(payload["analytics"]["totalTrades"], 2000)
        self.assertEqual(payload["debug"]["globalPaging"]["stopReason"], "offset_rejected")

    @patch("app.routes.markets.requests.get")
    def test_kalshi_markets_route_returns_normalized_markets(self, mock_get):
        mock_get.side_effect = [
            _MockResponse(
                [
                    {
                        "ticker": "KX-TEST-MKT",
                        "event_ticker": "KX-TEST",
                        "title": "yes weird contract leg",
                        "volume": 2500,
                        "yes_ask": "0.63",
                    }
                ]
            ),
            _MockResponse(
                {
                    "event": {
                        "event_ticker": "KX-TEST",
                        "title": "Will inflation rise in 2026?",
                        "sub_title": "By year-end",
                        "category": "Economy",
                    }
                }
            ),
        ]

        with patch.dict(os.environ, {"KALSHI_API_KEY": "test-key"}):
            res = self.client.get("/api/markets/markets?limit=1&source=kalshi")

        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertEqual(payload[0]["source"], "kalshi")
        self.assertEqual(payload[0]["conditionId"], "KX-TEST")
        self.assertEqual(payload[0]["question"], "Will inflation rise in 2026?")

    @patch("app.routes.markets.requests.get")
    def test_kalshi_trades_analytics_route_returns_analytics_shape(self, mock_get):
        recent_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        mock_get.return_value = _MockResponse(
            [
                {
                    "trade_id": "t1",
                    "ticker": "KX-TEST",
                    "user": "0xabc",
                    "count": 12,
                    "yes_price": 63,
                    "created_time": recent_iso,
                }
            ]
        )

        with patch.dict(os.environ, {"KALSHI_API_KEY": "test-key"}):
            res = self.client.get(
                "/api/markets/trades-analytics?windowHours=24&source=kalshi"
            )

        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertIn("analytics", payload)
        self.assertGreaterEqual(payload["count"], 1)
        self.assertGreater(payload["analytics"]["totalVolume"], 0)
        self.assertIn("byTime", payload["analytics"])
        self.assertIn("preDeadlineWindow", payload["analytics"])


if __name__ == "__main__":
    unittest.main()
