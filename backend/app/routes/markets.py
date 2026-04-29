"""Market data API routes - Polymarket proxy."""
import copy
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

import requests
from flask import current_app, jsonify, request

from ..market_categories import tag_events, tag_markets

from . import bp

POLYMARKET_GAMMA = os.environ.get("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com")
POLYMARKET_DATA = os.environ.get("POLYMARKET_DATA_URL", "https://data-api.polymarket.com")

MARKET_SOURCE_POLYMARKET = "polymarket"


def _one_year_ago_iso() -> str:
    """Return ISO8601 timestamp (UTC) for one year ago, seconds precision."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    # Gamma OpenAPI uses date-time strings; normalize to Z suffix.
    return cutoff.isoformat(timespec="seconds").replace("+00:00", "Z")


def _numeric_field(obj: dict, *keys: str) -> float:
    for k in keys:
        raw = obj.get(k)
        if raw is None:
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    return 0.0


def _event_volume_key(event: dict) -> float:
    return _numeric_field(event, "volumeNum", "volume", "liquidity")


def _market_volume_key(market: dict) -> float:
    return _numeric_field(market, "volumeNum", "volume", "liquidity")


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


# --- Polymarket Data API /trades: pagination & time window -----------------
# Public /trades returns newest fills first. offset is capped at 10_000 (OpenAPI),
# so at most ~20k rows are reachable for a single query shape. For 7d dashboards
# we page the global feed, then batch-fetch by top-volume conditionIds to widen
# time coverage (each market has its own recent tail).

DATA_TRADES_PAGE_LIMIT = 10_000
DATA_TRADES_OFFSETS = (0, 10_000)
DATA_TRADES_REQ_TIMEOUT = 22
# Batched market= queries for wide windows (conditionIds per request).
SUPP_MARKET_CHUNK = 8
SUPP_MARKET_MAX_CHUNKS = 8
CACHE_TTL_SECONDS = int(os.environ.get("UPSTREAM_CACHE_TTL_SECONDS", "120"))
_UPSTREAM_LIST_CACHE: Dict[str, Dict[str, Any]] = {}


def _cache_key(prefix: str, params: Dict[str, Any]) -> str:
    parts = [prefix]
    for k, v in sorted(params.items()):
        parts.append(f"{k}={v}")
    return "|".join(parts)


def _cache_get(key: str) -> Optional[List[Dict[str, Any]]]:
    hit = _UPSTREAM_LIST_CACHE.get(key)
    if not hit:
        return None
    if (time.time() - hit["stored_at"]) > CACHE_TTL_SECONDS:
        _UPSTREAM_LIST_CACHE.pop(key, None)
        return None
    return copy.deepcopy(hit["data"])


def _cache_set(key: str, data: List[Dict[str, Any]]) -> None:
    _UPSTREAM_LIST_CACHE[key] = {
        "stored_at": time.time(),
        "data": copy.deepcopy(data),
    }


def _get_json_with_retries(
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 10,
    retries: int = 2,
    backoff_seconds: float = 0.35,
) -> Any:
    """GET JSON with small retry/backoff for transient upstream failures."""
    last_error: Optional[requests.RequestException] = None
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_error = e
            if attempt >= retries:
                break
            time.sleep(backoff_seconds * (attempt + 1))
    raise last_error if last_error is not None else requests.RequestException(
        "Unknown upstream request failure"
    )


def _trade_ts_seconds(trade: Dict[str, Any]) -> Optional[int]:
    """Normalize Polymarket Data API trade timestamp to Unix seconds."""
    raw = trade.get("timestamp")
    if raw is None:
        return None
    try:
        ts = int(raw)
    except (TypeError, ValueError):
        return None
    if ts > 10**12:
        ts //= 1000
    return ts


def _trade_dedupe_key(trade: Dict[str, Any]) -> tuple:
    ts = _trade_ts_seconds(trade)
    return (
        str(trade.get("transactionHash") or ""),
        ts if ts is not None else 0,
        str(trade.get("conditionId") or ""),
        str(trade.get("proxyWallet") or ""),
        str(trade.get("side") or ""),
        str(trade.get("size") or ""),
        str(trade.get("price") or ""),
    )


def _trades_window_cutoff_ts(window_hours: int) -> int:
    now = int(datetime.now(timezone.utc).timestamp())
    return now - max(1, int(window_hours)) * 3600


def _fetch_data_api_trades_page(params: Dict[str, Any]) -> List[Dict[str, Any]]:
    data = _get_json_with_retries(
        f"{POLYMARKET_DATA}/trades",
        params=params,
        timeout=DATA_TRADES_REQ_TIMEOUT,
    )
    return data if isinstance(data, list) else []


def _merge_trades_in_window(
    dest: List[Dict[str, Any]],
    seen: Set[tuple],
    batch: List[Dict[str, Any]],
    cutoff_ts: int,
) -> None:
    for t in batch:
        if not isinstance(t, dict):
            continue
        k = _trade_dedupe_key(t)
        if k in seen:
            continue
        ts = _trade_ts_seconds(t)
        if ts is None or ts < cutoff_ts:
            continue
        seen.add(k)
        dest.append(t)


def _gamma_top_condition_ids(limit_markets: int = 160) -> List[str]:
    """Condition IDs for liquid markets (for supplementary /trades coverage)."""
    try:
        params: Dict[str, str] = {
            "limit": str(limit_markets),
            "start_date_min": _one_year_ago_iso(),
            "closed": "false",
            "active": "true",
            "order": "volume",
            "ascending": "false",
        }
        data = _get_json_with_retries(
            f"{POLYMARKET_GAMMA}/markets",
            params=params,
            timeout=15,
        )
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for m in data:
            if isinstance(m, dict) and m.get("conditionId"):
                out.append(str(m["conditionId"]))
        return out
    except requests.RequestException as e:
        current_app.logger.warning("Gamma markets list for trades enrichment failed: %s", e)
        return []


def _collect_trades_for_analytics_window(
    window_hours: int,
    passthrough: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Pull trades from Data API and keep only those inside [now - window, now]."""
    cutoff_ts = _trades_window_cutoff_ts(window_hours)
    seen: Set[tuple] = set()
    trades: List[Dict[str, Any]] = []

    has_market = bool(passthrough.get("market"))
    has_event = bool(passthrough.get("eventId"))
    has_user = bool(passthrough.get("user"))

    def pull_offset_pages(base: Dict[str, Any]) -> None:
        for off in DATA_TRADES_OFFSETS:
            params = {
                **base,
                "limit": DATA_TRADES_PAGE_LIMIT,
                "offset": off,
            }
            batch = _fetch_data_api_trades_page(params)
            _merge_trades_in_window(trades, seen, batch, cutoff_ts)
            if len(batch) < DATA_TRADES_PAGE_LIMIT:
                break

    def pull_first_page_only(base: Dict[str, Any]) -> None:
        params = {
            **base,
            "limit": DATA_TRADES_PAGE_LIMIT,
            "offset": 0,
        }
        batch = _fetch_data_api_trades_page(params)
        _merge_trades_in_window(trades, seen, batch, cutoff_ts)

    pull_offset_pages(dict(passthrough))

    # Widen coverage when the client asks for multi-day windows and the query is
    # still the global feed (no market / event / user filter).
    wide = window_hours >= 24 * 7
    if wide and not (has_market or has_event or has_user):
        base_pt = {k: v for k, v in passthrough.items() if k != "market"}
        cond_ids = _gamma_top_condition_ids(200)
        max_ids = SUPP_MARKET_CHUNK * SUPP_MARKET_MAX_CHUNKS
        for i in range(0, min(len(cond_ids), max_ids), SUPP_MARKET_CHUNK):
            chunk = cond_ids[i : i + SUPP_MARKET_CHUNK]
            if not chunk:
                break
            # One page per chunk keeps latency tolerable; global feed uses both offsets.
            pull_first_page_only({**base_pt, "market": ",".join(chunk)})

    return trades


@bp.route("/markets/events", methods=["GET"])
def get_events():
    """Fetch recent non-sports Polymarket events (Gamma API).

    - Restricts to events starting within the last year.
    - Orders by traded volume (Gamma ``order=volume``), then stable-sort locally.
    - Filters out sports-related events (based on tags).
    """
    limit = request.args.get("limit", "20")
    closed = request.args.get("closed", "false")

    params: Dict[str, str] = {
        "limit": limit,
        "closed": closed,
        "start_date_min": _one_year_ago_iso(),
        # Surface active, liquid markets (not only events that *started* recently).
        "order": "volume",
        "ascending": "false",
    }
    if str(closed).lower() in ("", "false", "0"):
        params["active"] = "true"
    cache_key = _cache_key("events", params)

    try:
        data = _get_json_with_retries(
            f"{POLYMARKET_GAMMA}/events",
            params=params,
            timeout=10,
        )

        # Gamma /events returns a list; preserve shape for the frontend.
        if isinstance(data, list):
            data = sorted(data, key=_event_volume_key, reverse=True)
            data = [e for e in data if not _is_sports_event(e or {})]
            data = tag_events(data)
            for item in data:
                if isinstance(item, dict):
                    item["source"] = MARKET_SOURCE_POLYMARKET
            _cache_set(cache_key, data)

        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket events request failed: %s", e)
        cached = _cache_get(cache_key)
        if cached is not None:
            resp = jsonify(cached)
            resp.headers["X-Upstream-Cache"] = "HIT"
            return resp
        return jsonify({"error": "Failed to fetch events", "events": []}), 502


@bp.route("/markets/events/<event_id>", methods=["GET"])
def get_event_by_id(event_id):
    """Fetch a single Polymarket event by id."""
    try:
        data = _get_json_with_retries(
            f"{POLYMARKET_GAMMA}/events/{event_id}",
            timeout=10,
        )
        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket event request failed: %s", e)
        return jsonify({"error": "Event not found"}), 502


@bp.route("/markets/markets", methods=["GET"])
def get_markets():
    """Fetch active Polymarket markets (Gamma), ordered by volume."""
    limit = request.args.get("limit", "50")

    try:
        params = {
            "limit": limit,
            "start_date_min": _one_year_ago_iso(),
            "closed": "false",
            "active": "true",
            "order": "volume",
            "ascending": "false",
        }
        cache_key = _cache_key("markets", params)
        data = _get_json_with_retries(
            f"{POLYMARKET_GAMMA}/markets",
            params=params,
            timeout=10,
        )

        if isinstance(data, list):
            data = sorted(data, key=_market_volume_key, reverse=True)
            data = tag_markets(data)
            for item in data:
                if isinstance(item, dict):
                    item["source"] = MARKET_SOURCE_POLYMARKET
            _cache_set(cache_key, data)

        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket markets request failed: %s", e)
        cached = _cache_get(cache_key)
        if cached is not None:
            resp = jsonify(cached)
            resp.headers["X-Upstream-Cache"] = "HIT"
            return resp
        return jsonify({"error": "Failed to fetch markets", "markets": []}), 502


@bp.route("/markets/kalshi/markets", methods=["GET"])
def get_kalshi_markets():
    """Temporary compatibility endpoint while Kalshi support is rebuilt."""
    return jsonify({"error": "Kalshi integration temporarily disabled", "markets": []}), 410


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

        ts = _trade_ts_seconds(t)

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
            # Bucket trades into hourly bins (timestamps are Unix seconds).
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
        ts = _trade_ts_seconds(t)
        if ts is None:
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

    Fetches from the public Data API ``/trades`` (newest-first, ``limit``/``offset``).
    For wide ``windowHours`` values the server pages the global feed (offsets 0 and
    10_000 per OpenAPI) and, when unfiltered, batches additional requests by
    top-volume ``conditionId`` so hourly charts can span multiple days.

    Query parameters (subset of the Polymarket Data API):
    - market: comma-separated condition IDs (Hash64).
    - eventId: comma-separated event IDs (int).
    - user: profile address (0x-prefixed).
    - side: BUY or SELL.
    - takerOnly: taker-only flag passthrough.
    - windowHours: trades must fall in [now - windowHours, now] (default 24);
      also drives pre-deadline concentration metrics.
    """
    passthrough: Dict[str, Any] = {}
    for key in ("market", "eventId", "user", "side", "filterType", "filterAmount"):
        value = request.args.get(key)
        if value:
            passthrough[key] = value

    taker_only = request.args.get("takerOnly")
    if taker_only is not None:
        passthrough["takerOnly"] = taker_only

    window_hours_raw = request.args.get("windowHours", "24")
    try:
        window_hours = int(window_hours_raw)
    except (TypeError, ValueError):
        window_hours = 24

    try:
        trades = _collect_trades_for_analytics_window(window_hours, passthrough)
        analytics = _compute_trades_analytics(trades, window_hours)
        return jsonify(
            {
                "analytics": analytics,
                "count": len(trades),
            }
        )
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket trades request failed: %s", e)
        empty_analytics = _compute_trades_analytics([], window_hours)
        return jsonify({"analytics": empty_analytics, "count": 0})
