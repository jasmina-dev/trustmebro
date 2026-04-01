"""Keyword + Gamma-tag driven categories for dashboard filters (Politics, Economy, …)."""

from __future__ import annotations

import re
from enum import Enum
from typing import Any, Dict, List, Sequence

MANUAL_TAGS_BY_ID: Dict[str, List["MarketCategory"]] = {}


class MarketCategory(str, Enum):
    POLITICS = "Politics"
    ECONOMY = "Economy"
    ENTERTAINMENT = "Entertainment"
    TECHNOLOGY = "Technology"
    CRYPTO = "Crypto"
    CLIMATE = "Climate"
    OTHER = "Other"


_GAMMA_TAG_TO_CATEGORY: Dict[str, MarketCategory] = {
    "politics": MarketCategory.POLITICS,
    "political": MarketCategory.POLITICS,
    "elections": MarketCategory.POLITICS,
    "election": MarketCategory.POLITICS,
    "economy": MarketCategory.ECONOMY,
    "economics": MarketCategory.ECONOMY,
    "fed": MarketCategory.ECONOMY,
    "finance": MarketCategory.ECONOMY,
    "business": MarketCategory.ECONOMY,
    "wall street": MarketCategory.ECONOMY,
    "crypto": MarketCategory.CRYPTO,
    "cryptocurrency": MarketCategory.CRYPTO,
    "bitcoin": MarketCategory.CRYPTO,
    "ethereum": MarketCategory.CRYPTO,
    "tech": MarketCategory.TECHNOLOGY,
    "technology": MarketCategory.TECHNOLOGY,
    "science": MarketCategory.TECHNOLOGY,
    "entertainment": MarketCategory.ENTERTAINMENT,
    "pop-culture": MarketCategory.ENTERTAINMENT,
    "pop culture": MarketCategory.ENTERTAINMENT,
    "climate": MarketCategory.CLIMATE,
    "environment": MarketCategory.CLIMATE,
}

_KEYWORD_RULES: Sequence[tuple[MarketCategory, tuple[str, ...]]] = (
    (
        MarketCategory.POLITICS,
        (
            "election",
            "president",
            "congress",
            "senate",
            "nominee",
            "democrat",
            "republican",
            "governor",
            "mayor",
            "vote",
            "ballot",
            "parliament",
            "prime minister",
            "trump",
            "biden",
            "political",
            "cabinet",
            "impeach",
        ),
    ),
    (
        MarketCategory.ECONOMY,
        (
            "fed",
            "federal reserve",
            "interest rate",
            "rate cut",
            "rate hike",
            "inflation",
            "gdp",
            "recession",
            "treasury",
            "unemployment",
            "tariff",
            "economic",
            "cpi",
            "jobs report",
            "stimulus",
        ),
    ),
    (
        MarketCategory.CRYPTO,
        (
            "bitcoin",
            "btc",
            "ethereum",
            "eth",
            "solana",
            "crypto",
            "defi",
            "nft",
            "blockchain",
        ),
    ),
    (
        MarketCategory.TECHNOLOGY,
        (
            "artificial intelligence",
            "openai",
            "semiconductor",
            "software",
            "google",
            "microsoft",
            "amazon",
            "nvidia",
            "chip",
        ),
    ),
    (
        MarketCategory.ENTERTAINMENT,
        (
            "oscar",
            "grammy",
            "emmy",
            "box office",
            "movie",
            "celebrity",
            "entertainment",
            "album",
            "streaming",
            "hollywood",
            "netflix",
            "amazon prime",
            "hbo max",
            "disney+",
            "apple tv+",
            "peacock",
            "hulu",
            "paramount+",
            "showtime",
            "starz",
            "hgtv",
            "eurovision",
        ),
    ),
    (
        MarketCategory.CLIMATE,
        (
            "climate",
            "carbon",
            "emissions",
            "methane",
            "warming",
            "cop28",
            "renewable",
            "fossil fuel",
            "solar",
        ),
    ),
)


def _collect_slugs_from_tags(tags: Any) -> List[str]:
    out: List[str] = []
    if not isinstance(tags, list):
        return out
    for t in tags:
        if isinstance(t, str):
            out.append(t.lower().strip())
        elif isinstance(t, dict):
            for key in ("slug", "label", "name"):
                raw = t.get(key)
                if raw:
                    out.append(str(raw).lower().strip())
    return out


def _append_str_chunks(chunks: List[str], v: Any) -> None:
    if v is not None and str(v).strip():
        chunks.append(str(v).lower())


def _visible_text(obj: Dict[str, Any]) -> str:
    """All copy we consider for keywords: event/market fields + slug + nested markets."""
    chunks: List[str] = []
    for key in (
        "title",
        "question",
        "description",
        "groupItemTitle",
        "category",
        "subtitle",
        "resolutionSource",
        "ticker",
    ):
        _append_str_chunks(chunks, obj.get(key))

    slug = obj.get("slug")
    if slug:
        chunks.append(str(slug).replace("-", " ").replace("_", " ").lower())

    markets = obj.get("markets")
    if isinstance(markets, list):
        for m in markets:
            if not isinstance(m, dict):
                continue
            for key in (
                "question",
                "description",
                "groupItemTitle",
                "title",
            ):
                _append_str_chunks(chunks, m.get(key))
            ms = m.get("slug")
            if ms:
                chunks.append(str(ms).replace("-", " ").replace("_", " ").lower())

    return " ".join(chunks)


def _manual_strings(oid: str) -> List[str]:
    raw = MANUAL_TAGS_BY_ID.get(oid) or []
    return [c.value if isinstance(c, MarketCategory) else str(c) for c in raw]


def get_categories(obj: Dict[str, Any]) -> List[str]:
    oid = str(obj.get("id") or "")
    manual = _manual_strings(oid)
    inferred: List[str] = []

    text = " " + _visible_text(obj) + " "
    for slug in _collect_slugs_from_tags(obj.get("tags")):
        if "sport" in slug:
            continue
        for token in re.split(r"[\s\-_/]+", slug):
            if not token:
                continue
            cat = _GAMMA_TAG_TO_CATEGORY.get(token)
            if cat and cat.value not in inferred:
                inferred.append(cat.value)

    for cat, keywords in _KEYWORD_RULES:
        if any(kw in text for kw in keywords):
            if cat.value not in inferred:
                inferred.append(cat.value)

    if re.search(r"\bai\b", text) and MarketCategory.TECHNOLOGY.value not in inferred:
        inferred.append(MarketCategory.TECHNOLOGY.value)
    for term in (r"\btech\b", r"\bllm\b"):
        if re.search(term, text) and MarketCategory.TECHNOLOGY.value not in inferred:
            inferred.append(MarketCategory.TECHNOLOGY.value)
            break

    seen: set[str] = set()
    merged: List[str] = []
    for label in manual + inferred:
        if label not in seen:
            seen.add(label)
            merged.append(label)

    if not merged:
        return [MarketCategory.OTHER.value]
    return merged


def tag_object(obj: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(obj, dict):
        return obj
    obj["tmCategories"] = get_categories(obj)
    return obj


def tag_events(events: List[Any]) -> List[Any]:
    for e in events:
        if isinstance(e, dict):
            tag_object(e)
    return events


def tag_markets(markets: List[Any]) -> List[Any]:
    return tag_events(markets)
