import unittest

from app.routes.markets import _compute_trades_analytics, _is_sports_event


class MarketsLogicTests(unittest.TestCase):
    def test_is_sports_event_detects_string_and_tag_object_labels(self):
        self.assertTrue(_is_sports_event({"tags": ["Sports"]}))
        self.assertTrue(_is_sports_event({"tags": [{"label": "team sports"}]}))
        self.assertFalse(_is_sports_event({"tags": [{"label": "Politics"}]}))

    def test_compute_trades_analytics_aggregates_core_metrics(self):
        # Timestamps are 1 hour apart.
        t1 = 1_700_000_000
        t2 = t1 + 3600
        t3 = t2 + 3600

        trades = [
            {"size": "10", "price": "0.5", "timestamp": t1, "proxyWallet": "A", "conditionId": "M1"},
            {"size": "4", "price": "0.25", "timestamp": t2, "proxyWallet": "B", "conditionId": "M1"},
            {"size": "2", "price": "0.5", "timestamp": t3, "proxyWallet": "A", "conditionId": "M2"},
        ]

        result = _compute_trades_analytics(trades, window_hours=1)

        # 10*0.5 + 4*0.25 + 2*0.5 = 7.0
        self.assertEqual(result["totalTrades"], 3)
        self.assertAlmostEqual(result["totalVolume"], 7.0)
        self.assertEqual(result["uniqueTraders"], 2)
        self.assertEqual(result["uniqueMarkets"], 2)

        self.assertEqual(len(result["byTime"]), 3)
        self.assertEqual(result["preDeadlineWindow"]["windowHours"], 1)

        # With a 1-hour window ending at t3, both t2 and t3 are included.
        self.assertEqual(result["preDeadlineWindow"]["tradeCount"], 2)
        self.assertAlmostEqual(result["preDeadlineWindow"]["volume"], 2.0)

        whales = result["whaleTraders"]
        self.assertGreaterEqual(len(whales), 1)
        self.assertEqual(whales[0]["address"], "A")
        self.assertAlmostEqual(whales[0]["volume"], 6.0)

    def test_compute_trades_analytics_returns_empty_shape_for_empty_input(self):
        result = _compute_trades_analytics([], window_hours=24)
        self.assertEqual(result["totalTrades"], 0)
        self.assertEqual(result["totalVolume"], 0.0)
        self.assertEqual(result["byTime"], [])
        self.assertEqual(result["perMarket"], [])
        self.assertEqual(result["whaleTraders"], [])


if __name__ == "__main__":
    unittest.main()
