"""Récupération des taux d'intérêt (Euribor, obligations souveraines)."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from xml.etree import ElementTree

import httpx
import yfinance as yf

from veille.config import BOND_TICKERS, ECB_DATA_URL

logger = logging.getLogger(__name__)

# Namespace ECB SDMX
NS = {"generic": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic"}


@dataclass
class RateData:
    """Taux d'intérêt ou rendement obligataire."""
    name: str
    value: float | None
    change_bps: float | None  # variation en points de base


async def _fetch_ecb_rate(session: httpx.AsyncClient, flow: str, key: str, name: str) -> RateData:
    """Récupère un taux depuis l'API ECB Statistical Data Warehouse."""
    url = f"{ECB_DATA_URL}/{flow}/{key}"
    try:
        resp = await session.get(
            url,
            params={"lastNObservations": "2", "detail": "dataonly"},
            headers={"Accept": "application/vnd.sdmx.genericdata+xml;version=2.1"},
            timeout=15.0,
        )
        resp.raise_for_status()

        root = ElementTree.fromstring(resp.text)
        obs = root.findall(".//generic:Obs", NS)

        if len(obs) >= 2:
            last_val = float(obs[-1].find("generic:ObsValue", NS).get("value"))
            prev_val = float(obs[-2].find("generic:ObsValue", NS).get("value"))
            change_bps = round((last_val - prev_val) * 100, 1)
            return RateData(name=name, value=round(last_val, 3), change_bps=change_bps)
        elif len(obs) == 1:
            val = float(obs[0].find("generic:ObsValue", NS).get("value"))
            return RateData(name=name, value=round(val, 3), change_bps=None)

    except Exception:
        logger.warning("Erreur récupération ECB %s (%s)", name, key)

    return RateData(name=name, value=None, change_bps=None)


async def fetch_euribor() -> list[RateData]:
    """Récupère les taux Euribor 3M et 12M depuis la BCE."""
    async with httpx.AsyncClient() as session:
        results = await asyncio.gather(
            _fetch_ecb_rate(session, "FM", "M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA", "Euribor 3M"),
            _fetch_ecb_rate(session, "FM", "M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA", "Euribor 12M"),
        )
    return list(results)


async def fetch_oat_france() -> RateData:
    """Récupère le rendement OAT France 10 ans depuis la BCE."""
    async with httpx.AsyncClient() as session:
        return await _fetch_ecb_rate(
            session, "FM", "M.FR.EUR.FR2.BB.BY.IREF", "OAT France 10Y"
        )


async def fetch_bund_germany() -> RateData:
    """Récupère le rendement Bund Allemagne 10 ans depuis la BCE."""
    async with httpx.AsyncClient() as session:
        return await _fetch_ecb_rate(
            session, "FM", "M.DE.EUR.FR2.BB.BY.IREF", "Bund Allemagne 10Y"
        )


async def fetch_us_treasury() -> RateData:
    """Récupère le rendement US Treasury 10Y via yfinance."""
    ticker = BOND_TICKERS["US Treasury 10Y"]

    def _download():
        try:
            data = yf.download(ticker, period="5d", progress=False)
            return data
        except Exception:
            logger.exception("Erreur téléchargement US Treasury")
            return None

    data = await asyncio.to_thread(_download)
    if data is None or data.empty or len(data) < 1:
        return RateData(name="US Treasury 10Y", value=None, change_bps=None)

    close_col = "Close"
    last = float(data[close_col].iloc[-1])

    change_bps = None
    if len(data) >= 2:
        prev = float(data[close_col].iloc[-2])
        change_bps = round((last - prev) * 100, 1)

    return RateData(name="US Treasury 10Y", value=round(last, 3), change_bps=change_bps)


async def fetch_all_rates() -> list[RateData]:
    """Récupère tous les taux."""
    euribor, oat, bund, ust = await asyncio.gather(
        fetch_euribor(),
        fetch_oat_france(),
        fetch_bund_germany(),
        fetch_us_treasury(),
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

    if isinstance(oat, RateData):
        results.append(oat)
    else:
        logger.error("Erreur OAT : %s", oat)
        results.append(RateData(name="OAT France 10Y", value=None, change_bps=None))

    if isinstance(bund, RateData):
        results.append(bund)
    else:
        logger.error("Erreur Bund : %s", bund)
        results.append(RateData(name="Bund Allemagne 10Y", value=None, change_bps=None))

    if isinstance(ust, RateData):
        results.append(ust)
    else:
        logger.error("Erreur US Treasury : %s", ust)
        results.append(RateData(name="US Treasury 10Y", value=None, change_bps=None))

    return results
