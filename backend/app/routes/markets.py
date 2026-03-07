"""Market data API routes - Polymarket & Kalshi proxy."""
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import requests
from flask import current_app, jsonify, request

from app.market_categories import tag_events, tag_markets
from . import bp

POLYMARKET_GAMMA = os.environ.get("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com")
POLYMARKET_DATA = os.environ.get("POLYMARKET_DATA_URL", "https://data-api.polymarket.com")
KALSHI_BASE = os.environ.get("KALSHI_API_URL", "https://trading-api.kalshi.com/trade-api/v2")


def _one_year_ago_iso() -> str:
    """Return ISO8601 timestamp (UTC) for one year ago, seconds precision."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    # Gamma OpenAPI uses date-time strings; normalize to Z suffix.
    return cutoff.isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe_parse_dt(value: Any) -> datetime:
    """Parse a Polymarket date-time string, falling back to the distant past."""
    if not value or not isinstance(value, str):
        return datetime.min.replace(tzinfo=timezone.utc)
    # Normalize Z suffix for fromisoformat
    ts = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def _event_start_key(event: dict) -> datetime:
    """Key function to sort events by start date, newest first."""
    # Prefer explicit ISO fields if present, then fall back to start_date.
    for field in ("startDateIso", "start_date", "startDate"):
        if field in event and event[field]:
            return _safe_parse_dt(event[field])
    return datetime.min.replace(tzinfo=timezone.utc)


def _market_start_key(market: dict) -> datetime:
    """Key function to sort markets by start date, newest first."""
    for field in ("startDateIso", "start_date", "startDate"):
        if field in market and market[field]:
            return _safe_parse_dt(market[field])
    return datetime.min.replace(tzinfo=timezone.utc)


def _is_sports_event(event: dict) -> bool:
    """Heuristic filter for sports events based on tags."""
    tags = event.get("tags") or []
    for t in tags:
        if isinstance(t, str):
            if t.lower() == "sports":
                return True
        elif isinstance(t, dict):
            label = str(t.get("label") or t.get("name") or t.get("slug") or "").lower()
            if "sport" in label:
                return True
    return False


@bp.route("/markets/events", methods=["GET"])
def get_events():
    """Fetch recent non-sports Polymarket events (Gamma API).

    - Restricts to events starting within the last year.
    - Sorts by most recent start_date first.
    - Filters out sports-related events (based on tags).
    """
    limit = request.args.get("limit", "20")
    closed = request.args.get("closed", "false")

    params = {
        "limit": limit,
        "closed": closed,
        # Only events in roughly the last year
        "start_date_min": _one_year_ago_iso(),
    }

    try:
        r = requests.get(f"{POLYMARKET_GAMMA}/events", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        # Gamma /events returns a list; preserve shape for the frontend.
        if isinstance(data, list):
            # Sort newest first, then filter out sports events.
            data = sorted(data, key=_event_start_key, reverse=True)
            data = [e for e in data if not _is_sports_event(e or {})]
            data = tag_events(data)

        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket events request failed: %s", e)
        return jsonify({"error": "Failed to fetch events", "events": []}), 502


@bp.route("/markets/events/<event_id>", methods=["GET"])
def get_event_by_id(event_id):
    """Fetch a single Polymarket event by id."""
    try:
        r = requests.get(f"{POLYMARKET_GAMMA}/events/{event_id}", timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket event request failed: %s", e)
        return jsonify({"error": "Event not found"}), 502


@bp.route("/markets/markets", methods=["GET"])
def get_markets():
    """Fetch recent Polymarket markets (Gamma). Optional limit.

    Restricts to markets whose start_date is within the last year and sorts
    by most recent start_date first to align with the events feed.
    """
    limit = request.args.get("limit", "50")
    try:
        params = {
            "limit": limit,
            "start_date_min": _one_year_ago_iso(),
        }
        r = requests.get(f"{POLYMARKET_GAMMA}/markets", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        if isinstance(data, list):
            data = sorted(data, key=_market_start_key, reverse=True)
            data = tag_markets(data)

        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket markets request failed: %s", e)
        return jsonify({"error": "Failed to fetch markets", "markets": []}), 502


@bp.route("/markets/kalshi/markets", methods=["GET"])
def get_kalshi_markets():
    """Fetch Kalshi markets (public endpoint when available)."""
    api_key = os.environ.get("KALSHI_API_KEY")
    if not api_key:
        return jsonify({"error": "Kalshi API key not configured", "markets": []}), 503
    try:
        r = requests.get(
            f"{KALSHI_BASE}/markets",
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except requests.RequestException as e:
        current_app.logger.warning("Kalshi markets request failed: %s", e)
        return jsonify({"error": "Failed to fetch Kalshi markets", "markets": []}), 502


def _compute_trades_analytics(trades: List[Dict[str, Any]], window_hours: int) -> Dict[str, Any]:
    """Aggregate basic analytics from a list of Polymarket trades.

    - Computes total volume and trade count.
    - Aggregates per trader (proxyWallet) and per market (conditionId).
    - Builds an hourly time series of volume and trades.
    - Computes volume concentration in the final `window_hours` before the last trade,
      which can be used to analyze pre-deadline spikes.
    """
    if not trades:
        return {
            "totalTrades": 0,
            "totalVolume": 0.0,
            "uniqueTraders": 0,
            "uniqueMarkets": 0,
            "byTime": [],
            "perMarket": [],
            "whaleTraders": [],
            "preDeadlineWindow": {
                "windowHours": window_hours,
                "volume": 0.0,
                "tradeCount": 0,
                "shareOfTotalVolume": 0.0,
            },
        }

    total_volume = 0.0
    total_trades = 0
    vol_by_trader: Dict[str, float] = {}
    trades_by_trader: Dict[str, int] = {}
    vol_by_market: Dict[str, float] = {}
    trades_by_market: Dict[str, int] = {}
    vol_by_bucket: Dict[int, float] = {}
    trades_by_bucket: Dict[int, int] = {}

    timestamps: List[int] = []

    for t in trades:
        try:
            size = float(t.get("size", 0) or 0)
            price = float(t.get("price", 0) or 0)
        except (TypeError, ValueError):
            size = 0.0
            price = 0.0
        trade_value = size * price

        ts_raw = t.get("timestamp")
        try:
            ts = int(ts_raw)
        except (TypeError, ValueError):
            ts = None

        addr = str(t.get("proxyWallet") or "")
        market = str(t.get("conditionId") or "")

        total_volume += trade_value
        total_trades += 1

        if addr:
            vol_by_trader[addr] = vol_by_trader.get(addr, 0.0) + trade_value
            trades_by_trader[addr] = trades_by_trader.get(addr, 0) + 1

        if market:
            vol_by_market[market] = vol_by_market.get(market, 0.0) + trade_value
            trades_by_market[market] = trades_by_market.get(market, 0) + 1

        if ts is not None:
            timestamps.append(ts)
            # Bucket trades into hourly bins for incremental patterns.
            bucket_start = ts - (ts % 3600)
            vol_by_bucket[bucket_start] = vol_by_bucket.get(bucket_start, 0.0) + trade_value
            trades_by_bucket[bucket_start] = trades_by_bucket.get(bucket_start, 0) + 1

    if not timestamps:
        earliest = latest = datetime.now(timezone.utc)
    else:
        earliest = datetime.fromtimestamp(min(timestamps), tz=timezone.utc)
        latest = datetime.fromtimestamp(max(timestamps), tz=timezone.utc)

    # Pre-deadline window: final `window_hours` before the last observed trade.
    window_hours = max(1, int(window_hours or 1))
    window_start = latest - timedelta(hours=window_hours)

    pre_window_volume = 0.0
    pre_window_trades = 0
    for t in trades:
        ts_raw = t.get("timestamp")
        try:
            ts = int(ts_raw)
        except (TypeError, ValueError):
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        if dt >= window_start:
            try:
                size = float(t.get("size", 0) or 0)
                price = float(t.get("price", 0) or 0)
            except (TypeError, ValueError):
                size = 0.0
                price = 0.0
            trade_value = size * price
            pre_window_volume += trade_value
            pre_window_trades += 1

    share_of_total = (pre_window_volume / total_volume) if total_volume > 0 else 0.0

    # Build hourly time series for incremental patterns.
    by_time = []
    for bucket_start, vol in sorted(vol_by_bucket.items()):
        bucket_dt = datetime.fromtimestamp(bucket_start, tz=timezone.utc)
        by_time.append(
            {
                "bucketStart": bucket_dt.isoformat(),
                "bucketEnd": (bucket_dt + timedelta(hours=1)).isoformat(),
                "volume": vol,
                "tradeCount": trades_by_bucket.get(bucket_start, 0),
            }
        )

    per_market = []
    for market, vol in sorted(vol_by_market.items(), key=lambda kv: kv[1], reverse=True):
        per_market.append(
            {
                "conditionId": market,
                "volume": vol,
                "tradeCount": trades_by_market.get(market, 0),
            }
        )

    # Whale traders: top traders by volume with their share of total.
    whale_traders = []
    for addr, vol in sorted(vol_by_trader.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        whale_traders.append(
            {
                "address": addr,
                "volume": vol,
                "tradeCount": trades_by_trader.get(addr, 0),
                "shareOfTotalVolume": (vol / total_volume) if total_volume > 0 else 0.0,
            }
        )

    return {
        "totalTrades": total_trades,
        "totalVolume": total_volume,
        "uniqueTraders": len(vol_by_trader),
        "uniqueMarkets": len(vol_by_market),
        "timeRange": {
            "earliest": earliest.isoformat(),
            "latest": latest.isoformat(),
        },
        "byTime": by_time,
        "perMarket": per_market,
        "whaleTraders": whale_traders,
        "preDeadlineWindow": {
            "windowHours": window_hours,
            "windowStart": window_start.isoformat(),
            "windowEnd": latest.isoformat(),
            "volume": pre_window_volume,
            "tradeCount": pre_window_trades,
            "shareOfTotalVolume": share_of_total,
        },
    }


@bp.route("/markets/trades-analytics", methods=["GET"])
def get_trades_analytics():
    """Aggregate Polymarket trade data into analytics-friendly metrics.

    This endpoint proxies the public Data API `/trades` endpoint and computes:
    - Incremental volume over time (hourly buckets).
    - Whale-style traders (top addresses by notional volume).
    - Volume concentration in the final N hours before the last trade
      (pre-deadline spikes).

    Query parameters (subset of the Polymarket Data API):
    - market: comma-separated list of condition IDs (Hash64).
    - eventId: comma-separated list of event IDs (int).
    - user: profile address (0x-prefixed).
    - side: BUY or SELL.
    - limit: max number of trades (default 1000, max 10000).
    - offset: pagination offset.
    - takerOnly: whether to restrict to taker trades (default true).
    - windowHours: lookback window for pre-deadline analysis (default 24).
    """
    params: Dict[str, Any] = {}

    # Passthrough parameters to the Data API.
    for key in ("market", "eventId", "user", "side", "filterType", "filterAmount"):
        value = request.args.get(key)
        if value:
            params[key] = value

    limit = request.args.get("limit", "1000")
    offset = request.args.get("offset")
    taker_only = request.args.get("takerOnly")
    window_hours_raw = request.args.get("windowHours", "24")

    params["limit"] = limit
    if offset is not None:
        params["offset"] = offset
    if taker_only is not None:
        params["takerOnly"] = taker_only

    try:
        window_hours = int(window_hours_raw)
    except (TypeError, ValueError):
        window_hours = 24

    try:
        r = requests.get(f"{POLYMARKET_DATA}/trades", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list):
            current_app.logger.warning("Unexpected trades payload shape: %s", type(data))
            trades: List[Dict[str, Any]] = []
        else:
            trades = data  # type: ignore[assignment]

        analytics = _compute_trades_analytics(trades, window_hours)
        return jsonify(
            {
                "analytics": analytics,
                "count": len(trades),
            }
        )
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket trades request failed: %s", e)
        return jsonify({"error": "Failed to fetch trades analytics"}), 502
