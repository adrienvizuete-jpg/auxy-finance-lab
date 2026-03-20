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

# User-Agent réaliste pour éviter les blocages RSS
USER_AGENT = "Mozilla/5.0 (compatible; AuxyVeille/1.0; +https://auxy-partners.com)"

# Mots-clés pour filtrer les articles business/économie (AURA)
BUSINESS_KEYWORDS = {
    "entreprise", "économie", "économique", "emploi", "investissement",
    "fiscalité", "fiscal", "immobilier", "industrie", "commerce",
    "startup", "chiffre d'affaires", "recrutement", "embauche",
    "croissance", "bourse", "finance", "financement", "banque",
    "innovation", "numérique", "digital", "tourisme d'affaires",
    "export", "import", "logistique", "agroalimentaire", "biotech",
    "PME", "ETI", "TPE", "restructuration", "acquisition",
    "fusion", "levée de fonds", "business", "marché", "conjoncture",
    "PIB", "inflation", "taux", "dette", "budget", "impôt",
}

# Mots-clés à exclure (hors-sujet)
EXCLUDE_KEYWORDS = {
    "élection", "électoral", "candidat", "vote", "scrutin", "municipale",
    "week-end", "sortir", "que faire", "bons plans", "loisir", "balade",
    "météo", "sport", "match", "football", "rugby", "handball", "basket",
    "concert", "festival", "spectacle", "cinéma", "théâtre", "exposition",
    "recette", "cuisine", "restaurant gastronomique", "gastronomie",
    "faits divers", "accident", "incendie", "agression", "meurtre", "procès",
    "migration", "migratoire", "réfugié",
    "nécrologie", "décès", "hommage", "obsèques",
    "manifestation", "grève", "blocage",
    "série", "film", "livre", "album", "artiste",
}


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
    truncated = text[:max_chars]
    last_space = truncated.rfind(" ")
    if last_space > max_chars // 2:
        truncated = truncated[:last_space]
    return truncated.rstrip(".,;:!? ") + "…"


def _is_business_article(title: str, summary: str) -> bool:
    """Vérifie si un article est pertinent business/économie."""
    text = (title + " " + summary).lower()

    # Exclure d'abord les hors-sujet
    for kw in EXCLUDE_KEYWORDS:
        if kw.lower() in text:
            return False

    # Vérifier la présence d'au moins un mot-clé business
    for kw in BUSINESS_KEYWORDS:
        if kw.lower() in text:
            return True

    return False


async def _fetch_rss(session: httpx.AsyncClient, source_name: str, url: str) -> list[NewsItem]:
    """Récupère et parse un flux RSS."""
    try:
        resp = await session.get(
            url,
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        )
        resp.raise_for_status()
        content = resp.text
    except Exception:
        logger.warning("Erreur récupération RSS %s (%s)", source_name, url)
        return []

    feed = feedparser.parse(content)
    items: list[NewsItem] = []

    for entry in feed.entries[:15]:
        title = entry.get("title", "").strip()
        if not title:
            continue

        link = entry.get("link", "")
        raw_summary = entry.get("summary", "") or entry.get("description", "")
        summary = _truncate(_clean_html(raw_summary))

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
    """Déduplique par titre normalisé."""
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

    all_items.sort(
        key=lambda x: x.published_at or datetime.min,
        reverse=True,
    )

    return _deduplicate(all_items)[:10]


async def fetch_regional_news() -> list[NewsItem]:
    """Récupère les actualités business AURA depuis les flux RSS."""
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

    # Filtrer : exclure d'abord les hors-sujet, puis ne garder que les business
    filtered_items = [
        item for item in all_items
        if _is_business_article(item.title, item.summary)
    ]

    # Sources prio (Bref Eco, JDE) : on garde même sans mot-clé business,
    # car elles sont déjà spécialisées économie/entreprises
    PRIORITY_SOURCES = {"Bref Eco", "Le Journal des Entreprises"}
    seen_titles = {item.title.lower() for item in filtered_items}
    for item in all_items:
        if item.source in PRIORITY_SOURCES and item.title.lower() not in seen_titles:
            # Vérifier seulement qu'il n'y a pas de mot-clé exclu
            text = (item.title + " " + item.summary).lower()
            if not any(kw.lower() in text for kw in EXCLUDE_KEYWORDS):
                filtered_items.append(item)
                seen_titles.add(item.title.lower())

    business_items = filtered_items

    business_items.sort(
        key=lambda x: x.published_at or datetime.min,
        reverse=True,
    )

    return _deduplicate(business_items)[:7]
