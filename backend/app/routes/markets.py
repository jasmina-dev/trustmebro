"""Market data API routes - Polymarket & Kalshi proxy."""
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from flask import current_app, jsonify, request

from ..market_categories import tag_events, tag_markets

from . import bp

POLYMARKET_GAMMA = os.environ.get("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com")
POLYMARKET_DATA = os.environ.get("POLYMARKET_DATA_URL", "https://data-api.polymarket.com")
KALSHI_BASE = os.environ.get("KALSHI_API_URL", "https://api.elections.kalshi.com/trade-api/v2")

MARKET_SOURCE_POLYMARKET = "polymarket"
MARKET_SOURCE_KALSHI = "kalshi"

# Simple TTL cache for Kalshi event titles to reduce upstream fan-out.
_kalshi_event_cache: Dict[str, Tuple[float, Dict[str, str]]] = {}
_KALSHI_EVENT_CACHE_TTL = 300  # seconds


def _one_year_ago_iso() -> str:
    """Return ISO8601 timestamp (UTC) for one year ago, seconds precision."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=365)
    # Gamma OpenAPI uses date-time strings; normalize to Z suffix.
    return cutoff.isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe_parse_dt(value: Optional[str]) -> datetime:
    """Parse ISO8601 timestamps defensively for market/date helpers."""
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


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


def _requested_source() -> str:
    source = str(request.args.get("source") or MARKET_SOURCE_POLYMARKET).strip().lower()
    return MARKET_SOURCE_KALSHI if source == MARKET_SOURCE_KALSHI else MARKET_SOURCE_POLYMARKET


def _safe_int(value: Any, default: int, upper: int = 200) -> int:
    """Parse *value* as int, clamped to ``[0, upper]``, falling back to *default*."""
    try:
        parsed = int(value or default)
    except (TypeError, ValueError):
        parsed = default
    return max(0, min(parsed, upper))


def _as_list_payload(data: Any, *keys: str) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


def _text_field(raw: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = raw.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _kalshi_market_id(raw: Dict[str, Any], fallback: str) -> str:
    return _text_field(raw, "ticker", "market_ticker", "marketTicker", "id", "symbol") or fallback


def _kalshi_event_id(raw: Dict[str, Any], market_id: str) -> str:
    return _text_field(
        raw,
        "event_ticker",
        "eventTicker",
        "series_ticker",
        "seriesTicker",
        "event_id",
        "eventId",
    ) or market_id


def _kalshi_market_rows(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    api_key = os.environ.get("KALSHI_API_KEY")
    if not api_key:
        raise requests.RequestException("Kalshi API key not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    rows: List[Dict[str, Any]] = []
    cursor: Optional[str] = None

    while True:
        params: Dict[str, Any] = {}
        if limit is not None:
            remaining = max(limit - len(rows), 0)
            if remaining == 0:
                break
            params["limit"] = remaining
        if cursor:
            params["cursor"] = cursor

        r = requests.get(
            f"{KALSHI_BASE}/markets",
            headers=headers,
            params=params,
            timeout=10,
        )
        r.raise_for_status()

        payload = r.json()
        batch = _as_list_payload(payload, "markets", "data", "results")
        if not batch:
            break
        rows.extend(batch)

        if limit is not None and len(rows) >= limit:
            return rows[:limit]

        cursor = None
        if isinstance(payload, dict):
            next_cursor = payload.get("cursor") or payload.get("next_cursor") or payload.get("nextCursor")
            if next_cursor:
                cursor = str(next_cursor)
        if not cursor:
            break

    return rows


def _kalshi_event_title_map_for_markets(markets: List[Dict[str, Any]]) -> Dict[str, Dict[str, str]]:
    api_key = os.environ.get("KALSHI_API_KEY")
    if not api_key:
        return {}

    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    tickers: List[str] = []
    seen: Set[str] = set()
    for row in markets:
        ticker = _kalshi_event_id(row, "")
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        tickers.append(ticker)
        if len(tickers) >= 120:
            break

    now = time.monotonic()
    out: Dict[str, Dict[str, str]] = {}
    fetch_tickers: List[str] = []

    for ticker in tickers:
        cached = _kalshi_event_cache.get(ticker)
        if cached and (now - cached[0]) < _KALSHI_EVENT_CACHE_TTL:
            out[ticker] = cached[1]
        else:
            fetch_tickers.append(ticker)

    for ticker in fetch_tickers:
        try:
            r = requests.get(
                f"{KALSHI_BASE}/events/{ticker}",
                headers=headers,
                timeout=6,
            )
            r.raise_for_status()
            payload = r.json()
            if isinstance(payload, dict):
                event = payload.get("event") if isinstance(payload.get("event"), dict) else payload
            else:
                event = {}
            if not isinstance(event, dict):
                continue
            info = {
                "title": _text_field(event, "title") or ticker,
                "sub_title": _text_field(event, "sub_title", "subTitle") or "",
                "category": _text_field(event, "category") or "",
            }
            _kalshi_event_cache[ticker] = (now, info)
            out[ticker] = info
        except requests.RequestException:
            continue

    return out


def _normalize_kalshi_market(
    raw: Dict[str, Any],
    index: int,
    event_titles: Optional[Dict[str, Dict[str, str]]] = None,
) -> Dict[str, Any]:
    market_id = _kalshi_market_id(raw, f"kalshi-{index}")
    event_id = _kalshi_event_id(raw, market_id)
    event_info = (event_titles or {}).get(event_id, {})
    title = (
        event_info.get("title")
        or _text_field(raw, "title", "question", "name", "subtitle")
        or market_id
    )
    slug = _text_field(raw, "ticker", "market_ticker", "slug") or market_id
    category = event_info.get("category") or _text_field(raw, "category", "sector", "group", "type")
    volume = _numeric_field(raw, "volume", "volumeNum", "liquidity", "dollar_volume", "dollarVolume")
    price = _text_field(raw, "yes_ask", "yesAsk", "price", "last_price", "lastPrice", "mark_price")

    return {
        "id": market_id,
        "source": MARKET_SOURCE_KALSHI,
        "eventId": event_id,
        "ticker": _text_field(raw, "ticker", "market_ticker", "marketTicker"),
        "eventTicker": _text_field(raw, "event_ticker", "eventTicker", "series_ticker", "seriesTicker"),
        "question": title,
        "conditionId": event_id,
        "slug": slug,
        "outcomePrices": price,
        "volume": volume,
        "volumeNum": volume,
        "liquidity": volume,
        "marketSlug": slug,
        "groupItemTitle": event_info.get("sub_title") or _text_field(raw, "subtitle", "name", "title"),
        "category": category,
        "tmCategories": [category] if category else [],
        "yesAsk": _text_field(raw, "yes_ask", "yesAsk"),
        "yesBid": _text_field(raw, "yes_bid", "yesBid"),
        "price": price,
    }


def _kalshi_events_from_normalized(
    normalized_markets: List[Dict[str, Any]],
    event_titles: Dict[str, Dict[str, str]],
) -> List[Dict[str, Any]]:
    """Group already-normalized Kalshi markets into event dicts."""
    grouped: Dict[str, Dict[str, Any]] = {}
    for normalized_market in normalized_markets:
        event_id = normalized_market["conditionId"]
        event = grouped.get(event_id)
        if not event:
            event_info = event_titles.get(event_id, {})
            event = {
                "id": event_id,
                "source": MARKET_SOURCE_KALSHI,
                "slug": normalized_market.get("slug"),
                "title": event_info.get("title") or normalized_market.get("question"),
                "description": event_info.get("sub_title") or normalized_market.get("category"),
                "markets": [],
                "category": normalized_market.get("category"),
                "tmCategories": normalized_market.get("tmCategories") or [],
            }
            grouped[event_id] = event
        event.setdefault("markets", []).append(normalized_market)
    return list(grouped.values())


def _kalshi_markets_response(limit: Optional[int] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, str]]]:
    """Fetch, normalize, and return Kalshi markets plus event titles.

    Returns a tuple of (normalized_markets, event_titles) so callers
    that also need events can reuse the data without extra requests.
    """
    rows = _kalshi_market_rows(limit=limit)
    event_titles = _kalshi_event_title_map_for_markets(rows)
    normalized = [
        _normalize_kalshi_market(raw, index, event_titles)
        for index, raw in enumerate(rows)
    ]
    return normalized, event_titles


def _to_unix_seconds(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        ts = int(value)
        if ts > 10**12:
            ts //= 1000
        return ts

    text = str(value).strip()
    if not text:
        return None

    try:
        ts = int(float(text))
        if ts > 10**12:
            ts //= 1000
        return ts
    except ValueError:
        pass

    try:
        dt = _safe_parse_dt(text)
        if dt == datetime.min.replace(tzinfo=timezone.utc):
            return None
        return int(dt.timestamp())
    except Exception:
        return None


def _kalshi_trade_rows(passthrough: Dict[str, Any]) -> List[Dict[str, Any]]:
    api_key = os.environ.get("KALSHI_API_KEY")
    if not api_key:
        raise requests.RequestException("Kalshi API key not configured")

    params: Dict[str, Any] = {"limit": "1000"}
    for key in ("market", "eventId", "side", "cursor"):
        value = passthrough.get(key)
        if value:
            params[key] = value

    headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}
    candidates = (
        f"{KALSHI_BASE}/trades",
        f"{KALSHI_BASE}/portfolio/trades",
        f"{KALSHI_BASE}/markets/trades",
    )

    last_error: Optional[Exception] = None
    for url in candidates:
        try:
            r = requests.get(url, headers=headers, params=params, timeout=12)
            r.raise_for_status()
            return _as_list_payload(r.json(), "trades", "data", "results")
        except requests.RequestException as e:
            last_error = e
            continue

    if last_error:
        raise requests.RequestException(f"Kalshi trades request failed: {last_error}")
    return []


def _normalize_kalshi_trade(raw: Dict[str, Any], index: int) -> Optional[Dict[str, Any]]:
    ticker = _text_field(raw, "ticker", "market_ticker", "marketTicker", "event_ticker", "eventTicker")
    market_id = ticker or _text_field(raw, "event_ticker", "eventTicker") or f"kalshi-{index}"
    trader = _text_field(raw, "user", "user_id", "trader", "wallet", "address") or "kalshi-user"

    ts = _to_unix_seconds(
        raw.get("created_time")
        or raw.get("createdAt")
        or raw.get("time")
        or raw.get("timestamp")
        or raw.get("executed_time")
    )
    if ts is None:
        return None

    size = _numeric_field(raw, "count", "size", "quantity", "contract_count", "volume")
    if size <= 0:
        size = 1.0

    raw_price = _numeric_field(
        raw,
        "price",
        "yes_price",
        "yesPrice",
        "yes_price_cents",
        "yesPriceCents",
        "avg_price",
    )
    if raw_price > 1:
        raw_price = raw_price / 100.0
    price = min(max(raw_price, 0.0), 1.0)

    return {
        "size": str(size),
        "price": str(price),
        "timestamp": ts,
        "proxyWallet": trader,
        "conditionId": market_id,
        "side": _text_field(raw, "side", "action"),
        "transactionHash": _text_field(raw, "trade_id", "id", "tradeId") or f"kalshi-{index}-{ts}",
    }


def _collect_kalshi_trades_for_analytics_window(
    window_hours: int,
    passthrough: Dict[str, Any],
) -> List[Dict[str, Any]]:
    cutoff_ts = _trades_window_cutoff_ts(window_hours)
    rows = _kalshi_trade_rows(passthrough)
    out: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        normalized = _normalize_kalshi_trade(row, index)
        if not normalized:
            continue
        ts = _trade_ts_seconds(normalized)
        if ts is None or ts < cutoff_ts:
            continue
        dedupe = str(normalized.get("transactionHash") or f"{index}-{ts}")
        if dedupe in seen:
            continue
        seen.add(dedupe)
        out.append(normalized)

    return out


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
    r = requests.get(
        f"{POLYMARKET_DATA}/trades",
        params=params,
        timeout=DATA_TRADES_REQ_TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
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
        r = requests.get(f"{POLYMARKET_GAMMA}/markets", params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
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
    source = _requested_source()
    limit = request.args.get("limit", "20")
    closed = request.args.get("closed", "false")

    if source == MARKET_SOURCE_KALSHI:
        parsed_limit = _safe_int(limit, 20, 200)
        try:
            markets, event_titles = _kalshi_markets_response(limit=parsed_limit)
            return jsonify(_kalshi_events_from_normalized(markets, event_titles)[:parsed_limit])
        except requests.RequestException as e:
            current_app.logger.warning("Kalshi events request failed: %s", e)
            return jsonify({"error": "Failed to fetch Kalshi events", "events": []}), 502

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

    try:
        r = requests.get(f"{POLYMARKET_GAMMA}/events", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        # Gamma /events returns a list; preserve shape for the frontend.
        if isinstance(data, list):
            data = sorted(data, key=_event_volume_key, reverse=True)
            data = [e for e in data if not _is_sports_event(e or {})]
            data = tag_events(data)
            for item in data:
                if isinstance(item, dict):
                    item["source"] = MARKET_SOURCE_POLYMARKET

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
    """Fetch active Polymarket markets (Gamma), ordered by volume."""
    limit = request.args.get("limit", "50")
    source = _requested_source()

    if source == MARKET_SOURCE_KALSHI:
        parsed_limit = _safe_int(limit, 50, 200)
        try:
            markets, _titles = _kalshi_markets_response(limit=parsed_limit)
            return jsonify(markets[:parsed_limit])
        except requests.RequestException as e:
            current_app.logger.warning("Kalshi markets request failed: %s", e)
            return jsonify({"error": "Failed to fetch Kalshi markets", "markets": []}), 502

    try:
        params = {
            "limit": limit,
            "start_date_min": _one_year_ago_iso(),
            "closed": "false",
            "active": "true",
            "order": "volume",
            "ascending": "false",
        }
        r = requests.get(f"{POLYMARKET_GAMMA}/markets", params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        if isinstance(data, list):
            data = sorted(data, key=_market_volume_key, reverse=True)
            data = tag_markets(data)
            for item in data:
                if isinstance(item, dict):
                    item["source"] = MARKET_SOURCE_POLYMARKET

        return jsonify(data)
    except requests.RequestException as e:
        current_app.logger.warning("Polymarket markets request failed: %s", e)
        return jsonify({"error": "Failed to fetch markets", "markets": []}), 502


@bp.route("/markets/kalshi/markets", methods=["GET"])
def get_kalshi_markets():
    """Fetch Kalshi markets (public endpoint when available)."""
    if not os.environ.get("KALSHI_API_KEY"):
        return jsonify({"error": "Kalshi API key not configured", "markets": []}), 503
    try:
        markets, _titles = _kalshi_markets_response()
        return jsonify(markets)
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
    source = _requested_source()
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
        if source == MARKET_SOURCE_KALSHI:
            trades = _collect_kalshi_trades_for_analytics_window(
                window_hours,
                passthrough,
            )
            analytics = _compute_trades_analytics(trades, window_hours)
            return jsonify({"analytics": analytics, "count": len(trades)})

        trades = _collect_trades_for_analytics_window(window_hours, passthrough)
        analytics = _compute_trades_analytics(trades, window_hours)
        return jsonify(
            {
                "analytics": analytics,
                "count": len(trades),
            }
        )
    except requests.RequestException as e:
        current_app.logger.warning("%s trades request failed: %s", source.capitalize(), e)
        empty_analytics = _compute_trades_analytics([], window_hours)
        if source == MARKET_SOURCE_KALSHI:
            return (
                jsonify(
                    {
                        "error": "Kalshi trades endpoint unavailable or requires signed API auth",
                        "analytics": empty_analytics,
                        "count": 0,
                    }
                ),
                502,
            )
        return jsonify({"analytics": empty_analytics, "count": 0})
