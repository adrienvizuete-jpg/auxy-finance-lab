"""Récupération des taux d'intérêt (Euribor, obligations souveraines)."""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass

import httpx
import yfinance as yf

from veille.config import ECB_DATA_URL

logger = logging.getLogger(__name__)


@dataclass
class RateData:
    """Taux d'intérêt ou rendement obligataire."""
    name: str
    value: float | None
    change_bps: float | None  # variation en points de base


# ---------------------------------------------------------------------------
# ECB API (JSON) — pour Euribor
# ---------------------------------------------------------------------------

async def _fetch_ecb_json(session: httpx.AsyncClient, flow: str, key: str, name: str) -> RateData:
    """Récupère un taux depuis l'API ECB en format JSON (plus fiable que XML)."""
    url = f"{ECB_DATA_URL}/{flow}/{key}"
    try:
        resp = await session.get(
            url,
            params={"lastNObservations": "5", "detail": "dataonly", "format": "jsondata"},
            headers={
                "Accept": "application/json",
                "User-Agent": "AuxyVeille/1.0",
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()

        # Naviguer dans la structure JSON SDMX
        datasets = data.get("dataSets", [])
        if not datasets:
            logger.warning("ECB %s : pas de dataset", name)
            return RateData(name=name, value=None, change_bps=None)

        series = datasets[0].get("series", {})
        if not series:
            logger.warning("ECB %s : pas de séries", name)
            return RateData(name=name, value=None, change_bps=None)

        # Prendre la première série disponible
        first_series = next(iter(series.values()))
        observations = first_series.get("observations", {})
        if not observations:
            logger.warning("ECB %s : pas d'observations", name)
            return RateData(name=name, value=None, change_bps=None)

        # Les observations sont indexées par position temporelle
        sorted_obs = sorted(observations.items(), key=lambda x: int(x[0]))
        values = [float(v[0]) for _, v in sorted_obs if v]

        if len(values) >= 2:
            last_val = values[-1]
            prev_val = values[-2]
            change_bps = round((last_val - prev_val) * 100, 1)
            return RateData(name=name, value=round(last_val, 3), change_bps=change_bps)
        elif len(values) == 1:
            return RateData(name=name, value=round(values[0], 3), change_bps=None)

    except Exception:
        logger.warning("Erreur récupération ECB JSON %s (%s)", name, key, exc_info=True)

    return RateData(name=name, value=None, change_bps=None)


# ---------------------------------------------------------------------------
# yfinance — pour OAT, Bund, US Treasury
# ---------------------------------------------------------------------------

async def _fetch_yf_rate(symbol: str, name: str) -> RateData:
    """Récupère un taux via yfinance (ticker individuel)."""

    def _download():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d")
            return hist
        except Exception:
            logger.exception("Erreur téléchargement %s", name)
            return None

    data = await asyncio.to_thread(_download)
    if data is None or data.empty:
        return RateData(name=name, value=None, change_bps=None)

    data = data.dropna(subset=["Close"])
    if len(data) < 1:
        return RateData(name=name, value=None, change_bps=None)

    last = float(data["Close"].iloc[-1])
    if math.isnan(last):
        return RateData(name=name, value=None, change_bps=None)

    change_bps = None
    if len(data) >= 2:
        prev = float(data["Close"].iloc[-2])
        if not math.isnan(prev):
            change_bps = round((last - prev) * 100, 1)

    return RateData(name=name, value=round(last, 3), change_bps=change_bps)


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

async def fetch_euribor() -> list[RateData]:
    """Récupère les taux Euribor 3M et 12M depuis la BCE (JSON)."""
    # Essayer plusieurs formats de clés SDMX (B=business daily, D=daily, M=monthly)
    key_templates = [
        ("B", "B.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "B.U2.EUR.RT.MM.EURIBOR1YD_.HSTA"),
        ("D", "D.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "D.U2.EUR.RT.MM.EURIBOR1YD_.HSTA"),
        ("M", "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA"),
    ]

    async with httpx.AsyncClient() as session:
        for freq, key_3m, key_12m in key_templates:
            e3m, e12m = await asyncio.gather(
                _fetch_ecb_json(session, "FM", key_3m, "Euribor 3M"),
                _fetch_ecb_json(session, "FM", key_12m, "Euribor 12M"),
            )
            if e3m.value is not None or e12m.value is not None:
                logger.info("Euribor trouvé avec fréquence %s", freq)
                return [e3m, e12m]

    logger.warning("Aucune fréquence ECB n'a fonctionné pour Euribor")
    return [
        RateData(name="Euribor 3M", value=None, change_bps=None),
        RateData(name="Euribor 12M", value=None, change_bps=None),
    ]


async def fetch_sovereign_yields() -> list[RateData]:
    """Récupère OAT France 10Y, Bund Allemagne 10Y, US Treasury 10Y."""
    # US Treasury via yfinance (journalier, fiable)
    ust = await _fetch_yf_rate("^TNX", "US Treasury 10Y")

    # OAT et Bund via ECB IRS (Interest Rate Statistics) — données mensuelles
    # Clé : M.{pays}.L.L40.CI.0000.EUR.N.Z (taux de convergence Maastricht = rendement 10Y)
    async with httpx.AsyncClient() as session:
        ecb_oat, ecb_bund = await asyncio.gather(
            _fetch_ecb_json(session, "IRS", "M.FR.L.L40.CI.0000.EUR.N.Z", "OAT France 10Y"),
            _fetch_ecb_json(session, "IRS", "M.DE.L.L40.CI.0000.EUR.N.Z", "Bund Allemagne 10Y"),
        )

    return [ecb_oat, ecb_bund, ust]


async def fetch_all_rates() -> list[RateData]:
    """Récupère tous les taux."""
    euribor, sovereigns = await asyncio.gather(
        fetch_euribor(),
        fetch_sovereign_yields(),
        return_exceptions=True,
    )

    results: list[RateData] = []

    if isinstance(euribor, list):
        results.extend(euribor)
    else:
        logger.error("Erreur Euribor : %s", euribor)
        results.extend([
            RateData(name="Euribor 3M", value=None, change_bps=None),
            RateData(name="Euribor 12M", value=None, change_bps=None),
        ])

    if isinstance(sovereigns, list):
        results.extend(sovereigns)
    else:
        logger.error("Erreur obligations : %s", sovereigns)
        results.extend([
            RateData(name="OAT France 10Y", value=None, change_bps=None),
            RateData(name="Bund Allemagne 10Y", value=None, change_bps=None),
            RateData(name="US Treasury 10Y", value=None, change_bps=None),
        ])

    return results
