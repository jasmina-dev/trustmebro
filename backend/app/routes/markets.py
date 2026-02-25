"""Market data API routes - Polymarket & Kalshi proxy."""
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from flask import current_app, jsonify, request

from . import bp

POLYMARKET_GAMMA = os.environ.get("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com")
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
