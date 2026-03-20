"""Client actualités GNews.io pour la veille quotidienne."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import httpx

from veille.config import GNEWS_BASE_URL, GNEWS_QUERIES_AURA, GNEWS_QUERIES_FR

logger = logging.getLogger(__name__)


@dataclass
class NewsItem:
    """Article d'actualité."""
    title: str
    url: str
    source: str
    published_at: datetime | None


async def _search_gnews(
    session: httpx.AsyncClient,
    api_key: str,
    query: str,
    max_results: int = 5,
) -> list[NewsItem]:
    """Effectue une recherche GNews."""
    try:
        resp = await session.get(
            f"{GNEWS_BASE_URL}/search",
            params={
                "q": query,
                "lang": "fr",
                "country": "fr",
                "max": max_results,
                "token": api_key,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        logger.warning("Erreur GNews pour la requête '%s'", query)
        return []

    items: list[NewsItem] = []
    for article in data.get("articles", []):
        try:
            pub_date = datetime.fromisoformat(
                article["publishedAt"].replace("Z", "+00:00")
            )
        except (KeyError, ValueError):
            pub_date = None

        items.append(NewsItem(
            title=article.get("title", ""),
            url=article.get("url", ""),
            source=article.get("source", {}).get("name", ""),
            published_at=pub_date,
        ))

    return items


def _deduplicate(items: list[NewsItem]) -> list[NewsItem]:
    """Déduplique les articles par URL."""
    seen: set[str] = set()
    unique: list[NewsItem] = []
    for item in items:
        if item.url not in seen:
            seen.add(item.url)
            unique.append(item)
    return unique


async def fetch_french_news(api_key: str) -> list[NewsItem]:
    """Récupère les actualités économiques françaises."""
    async with httpx.AsyncClient() as session:
        all_items: list[NewsItem] = []
        for query in GNEWS_QUERIES_FR:
            items = await _search_gnews(session, api_key, query)
            all_items.extend(items)

    return _deduplicate(all_items)[:10]


async def fetch_regional_news(api_key: str) -> list[NewsItem]:
    """Récupère les actualités Auvergne-Rhône-Alpes."""
    async with httpx.AsyncClient() as session:
        all_items: list[NewsItem] = []
        for query in GNEWS_QUERIES_AURA:
            items = await _search_gnews(session, api_key, query)
            all_items.extend(items)

    return _deduplicate(all_items)[:10]
