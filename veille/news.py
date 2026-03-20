"""Actualités via flux RSS de sources financières qualitatives."""

from __future__ import annotations

import asyncio
import html
import logging
import re
from dataclasses import dataclass
from datetime import datetime

import feedparser
import httpx

from veille.config import RSS_FEEDS_AURA, RSS_FEEDS_FRANCE

logger = logging.getLogger(__name__)


@dataclass
class NewsItem:
    """Article d'actualité."""
    title: str
    url: str
    source: str
    summary: str
    published_at: datetime | None


def _clean_html(raw: str) -> str:
    """Supprime les balises HTML et nettoie le texte."""
    text = re.sub(r"<[^>]+>", "", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _truncate(text: str, max_chars: int = 200) -> str:
    """Tronque proprement un texte à max_chars caractères."""
    if len(text) <= max_chars:
        return text
    # Couper au dernier espace avant max_chars
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    if last_space > max_chars // 2:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:!? ") + "…"


async def _fetch_rss(session: httpx.AsyncClient, source_name: str, url: str) -> list[NewsItem]:
    """Récupère et parse un flux RSS."""
    try:
        resp = await session.get(url, timeout=15.0, follow_redirects=True)
        resp.raise_for_status()
        content = resp.text
    except Exception:
        logger.warning("Erreur récupération RSS %s (%s)", source_name, url)
        return []

    # Parser avec feedparser (sync, rapide)
    feed = feedparser.parse(content)
    items: list[NewsItem] = []

    for entry in feed.entries[:10]:
        title = entry.get("title", "").strip()
        if not title:
            continue

        link = entry.get("link", "")

        # Extraire le résumé depuis description ou summary
        raw_summary = entry.get("summary", "") or entry.get("description", "")
        summary = _truncate(_clean_html(raw_summary))

        # Date de publication
        pub_date = None
        if entry.get("published_parsed"):
            try:
                pub_date = datetime(*entry.published_parsed[:6])
            except (TypeError, ValueError):
                pass

        items.append(NewsItem(
            title=title,
            url=link,
            source=source_name,
            summary=summary,
            published_at=pub_date,
        ))

    logger.debug("RSS %s → %d articles", source_name, len(items))
    return items


def _deduplicate(items: list[NewsItem]) -> list[NewsItem]:
    """Déduplique par titre normalisé (les URLs diffèrent parfois entre sources)."""
    seen: set[str] = set()
    unique: list[NewsItem] = []
    for item in items:
        key = item.title.lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


async def fetch_french_news() -> list[NewsItem]:
    """Récupère les actualités économiques françaises depuis les flux RSS."""
    async with httpx.AsyncClient() as session:
        tasks = [
            _fetch_rss(session, name, url)
            for name, url in RSS_FEEDS_FRANCE.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[NewsItem] = []
    for result in results:
        if isinstance(result, list):
            all_items.extend(result)
        else:
            logger.warning("Erreur flux RSS France : %s", result)

    # Trier par date (les plus récents d'abord)
    all_items.sort(
        key=lambda x: x.published_at or datetime.min,
        reverse=True,
    )

    return _deduplicate(all_items)[:10]


async def fetch_regional_news() -> list[NewsItem]:
    """Récupère les actualités Auvergne-Rhône-Alpes depuis les flux RSS."""
    async with httpx.AsyncClient() as session:
        tasks = [
            _fetch_rss(session, name, url)
            for name, url in RSS_FEEDS_AURA.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[NewsItem] = []
    for result in results:
        if isinstance(result, list):
            all_items.extend(result)
        else:
            logger.warning("Erreur flux RSS AURA : %s", result)

    all_items.sort(
        key=lambda x: x.published_at or datetime.min,
        reverse=True,
    )

    return _deduplicate(all_items)[:10]
