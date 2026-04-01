import pytest

from app.market_categories import (
    MarketCategory,
    get_categories,
    tag_object,
    tag_events,
)


def test_get_categories_infers_crypto():
    assert "Crypto" in get_categories({"title": "Will Bitcoin reach 100k?", "id": "e1"})


def test_get_categories_infers_politics():
    assert "Politics" in get_categories({"question": "Who wins the 2028 election?", "id": "m1"})


def test_get_categories_eurovision_from_slug():
    assert "Entertainment" in get_categories(
        {"id": "ev1", "title": "Song contest 2026", "slug": "eurovision-winner-2026"}
    )


def test_get_categories_other_when_no_match():
    assert get_categories({"title": "Random xyzabc unmatched", "id": "z"}) == ["Other"]


def test_manual_tags_take_precedence_and_merge(monkeypatch):
    monkeypatch.setattr(
        "app.market_categories.MANUAL_TAGS_BY_ID",
        {"manual-1": [MarketCategory.POLITICS]},
    )
    cats = get_categories(
        {"id": "manual-1", "title": "Something about bitcoin and ethereum"}
    )
    assert cats[0] == "Politics"
    assert "Crypto" in cats


def test_tag_object_adds_tm_categories():
    out = tag_object({"id": "1", "title": "AI regulation"})
    assert out["id"] == "1"
    assert "Technology" in out["tmCategories"]


def test_tag_events_handles_empty_dict():
    tagged = tag_events([{}])
    assert tagged[0]["tmCategories"] == ["Other"]
