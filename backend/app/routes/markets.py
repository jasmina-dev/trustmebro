"""Market data API routes - Polymarket & Kalshi proxy."""
import os
import requests
from flask import current_app, jsonify, request

from . import bp

POLYMARKET_GAMMA = os.environ.get("POLYMARKET_GAMMA_URL", "https://gamma-api.polymarket.com")
KALSHI_BASE = os.environ.get("KALSHI_API_URL", "https://trading-api.kalshi.com/trade-api/v2")


@bp.route("/markets/events", methods=["GET"])
def get_events():
    """Fetch Polymarket events (Gamma API). Supports limit and closed query params."""
    limit = request.args.get("limit", "20")
    closed = request.args.get("closed", "false")
    try:
        r = requests.get(
            f"{POLYMARKET_GAMMA}/events",
            params={"limit": limit, "closed": closed},
            timeout=10,
        )
        r.raise_for_status()
        return jsonify(r.json())
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
    """Fetch Polymarket markets (Gamma). Optional limit."""
    limit = request.args.get("limit", "50")
    try:
        r = requests.get(f"{POLYMARKET_GAMMA}/markets", params={"limit": limit}, timeout=10)
        r.raise_for_status()
        return jsonify(r.json())
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
