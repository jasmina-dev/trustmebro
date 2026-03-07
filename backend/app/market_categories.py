"""Helpers for tagging Polymarket events and markets into high-level categories.

This module is deliberately simple and rule-based so that students can
add or tweak categories and keyword rules without touching the rest of
the backend.
"""
# Maintained with assistance from Cursor AI as of 2026-03-4.

from enum import Enum
from typing import Any, Dict, Iterable, List, Set


class MarketCategory(str, Enum):
    POLITICS = "Politics"
    ECONOMY = "Economy"
    ENTERTAINMENT = "Entertainment"
    TECHNOLOGY = "Technology"
    CRYPTO = "Crypto"
    CLIMATE = "Climate"
    OTHER = "Other"


# Manual overrides by Polymarket identifier.
# Keys can be event IDs, condition IDs, or internal IDs as strings.
MANUAL_TAGS_BY_ID: Dict[str, List[MarketCategory]] = {}


CATEGORY_KEYWORDS: Dict[MarketCategory, List[str]] = {
    MarketCategory.POLITICS: [
        "election",
        "president",
        "prime minister",
        "parliament",
        "senate",
        "house",
        "congress",
        "democrat",
        "republican",
        "labour",
        "tory",
        "vote",
        "voting",
        "ballot",
        "politic",
    ],
    MarketCategory.ECONOMY: [
        "inflation",
        "interest rate",
        "federal reserve",
        "fed",
        "ecb",
        "gdp",
        "unemployment",
        "recession",
        "cpi",
        "jobs report",
        "economy",
        "economic",
        "economics",
        "econ",
    ],
    MarketCategory.ENTERTAINMENT: [
        "oscars",
        "oscar",
        "academy awards",
        "emmy",
        "grammy",
        "bafta",
        "movie",
        "film",
        "box office",
        "tv show",
        "series",
        "celebrity",
        "taylor swift",
        "concert",
        "album",
        "song",
        "music",
        "entertainment",
    ],
    MarketCategory.CRYPTO: [
        "bitcoin",
        "btc",
        "ethereum",
        "eth",
        "crypto",
        "token",
        "blockchain",
        "stablecoin",
        "solana",
        "xrp",
        "dogecoin",
    ],
    MarketCategory.CLIMATE: [
        "climate",
        "temperature",
        "global warming",
        "co2",
        "carbon",
        "emissions",
        "sea level",
        "hurricane",
        "wildfire",
        "heatwave",
    ],
    MarketCategory.TECHNOLOGY: [
        "artificial intelligence",
        "machine learning",
        "semiconductor",
        "chip",
        "nvidia",
        "openai",
        "google",
        "microsoft",
        "apple",
        "meta",
        "technology",
        "tech",
        "ai",
    ],
}


def _get_manual_tags_for(obj: Dict[str, Any]) -> List[MarketCategory]:
    """Return any manually configured tags for this event/market."""
    possible_ids: Iterable[Any] = (
        obj.get("id"),
        obj.get("_id"),
        obj.get("eventId"),
        obj.get("conditionId"),
    )
    for raw in possible_ids:
        if not raw:
            continue
        key = str(raw)
        manual = MANUAL_TAGS_BY_ID.get(key)
        if manual:
            return manual
    return []


def _text_blob(obj: Dict[str, Any]) -> str:
    """Concatenate common text fields and tags into a single lowercase blob."""
    parts: List[str] = []
    for key in ("question", "title", "name", "description", "slug"):
        val = obj.get(key)
        if isinstance(val, str):
            parts.append(val)

    tags = obj.get("tags") or []
    for t in tags:
        if isinstance(t, str):
            parts.append(t)
        elif isinstance(t, dict):
            for k in ("label", "name", "slug"):
                v = t.get(k)
                if isinstance(v, str):
                    parts.append(v)

    return " ".join(parts).lower()


def _infer_categories(obj: Dict[str, Any]) -> List[MarketCategory]:
    """Infer categories from the Polymarket text content."""
    text = _text_blob(obj)
    categories: Set[MarketCategory] = set()

    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in text for kw in keywords):
            categories.add(category)

    return list(categories)


def get_categories(obj: Dict[str, Any]) -> List[str]:
    """Return a list of high-level category labels for an event/market."""
    manual = _get_manual_tags_for(obj)
    inferred = _infer_categories(obj)

    ordered: List[MarketCategory] = []
    seen: Set[MarketCategory] = set()
    for cat in manual + inferred:
        if cat not in seen:
            seen.add(cat)
            ordered.append(cat)

    if not ordered:
        ordered.append(MarketCategory.OTHER)

    return [c.value for c in ordered]


def tag_object(obj: Dict[str, Any]) -> Dict[str, Any]:
    """Return a shallow copy of obj with a `tmCategories` field added."""
    tagged = dict(obj)
    tagged["tmCategories"] = get_categories(obj)
    return tagged


def tag_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach TrustMeBro categories to each event in a list."""
    return [tag_object(e or {}) for e in events]


def tag_markets(markets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach TrustMeBro categories to each market in a list."""
    return [tag_object(m or {}) for m in markets]