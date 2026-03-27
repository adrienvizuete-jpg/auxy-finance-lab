"""Récupération des taux d'intérêt (Euribor, obligations souveraines)."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import xml.etree.ElementTree as ET
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
# Bundesbank API — pour Bund Allemagne 10Y (quotidien)
# ---------------------------------------------------------------------------

BUNDESBANK_BUND_URL = (
    "https://api.statistiken.bundesbank.de/rest/data/BBSIS/"
    "D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A"
)

# Namespace SDMX-ML de la Bundesbank
_BBK_NS = {
    "mes": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message",
    "gen": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/data/generic",
}


async def _fetch_bundesbank_yield() -> RateData:
    """Récupère le rendement Bund 10Y quotidien depuis l'API Bundesbank (XML)."""
    name = "Bund Allemagne 10Y"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                BUNDESBANK_BUND_URL,
                params={"lastNObservations": "5", "detail": "dataonly"},
                headers={
                    "Accept": "application/xml",
                    "User-Agent": "AuxyVeille/1.0",
                },
                timeout=20.0,
            )
            resp.raise_for_status()

            root = ET.fromstring(resp.text)

            # Extraire les observations du XML SDMX générique
            obs_elements = root.findall(".//gen:Obs", _BBK_NS)
            values: list[float] = []
            for obs in obs_elements:
                val_el = obs.find("gen:ObsValue", _BBK_NS)
                if val_el is not None and val_el.get("value"):
                    try:
                        values.append(float(val_el.get("value")))
                    except ValueError:
                        continue

            if len(values) >= 2:
                last_val = values[-1]
                prev_val = values[-2]
                change_bps = round((last_val - prev_val) * 100, 1)
                return RateData(name=name, value=round(last_val, 3), change_bps=change_bps)
            elif len(values) == 1:
                return RateData(name=name, value=round(values[0], 3), change_bps=None)

    except Exception:
        logger.warning("Erreur Bundesbank Bund 10Y", exc_info=True)

    return RateData(name=name, value=None, change_bps=None)


# ---------------------------------------------------------------------------
# Banque de France Webstat API — pour OAT France 10Y (quotidien)
# ---------------------------------------------------------------------------

BDF_WEBSTAT_URL = "https://webstat.banque-france.fr/api/v2.1/data"
BDF_OAT_SERIES = "FM/D.FR.EUR.FR2.BB.FR10YT_RR.YLD"


async def _fetch_bdf_yield() -> RateData:
    """Récupère le rendement OAT France 10Y quotidien depuis la BdF Webstat API."""
    name = "OAT France 10Y"
    api_key = os.environ.get("BDF_API_KEY", "").strip()

    if not api_key:
        logger.info("BDF_API_KEY absente, fallback ECB IRS mensuel pour OAT")
        return await _fetch_oat_fallback()

    url = f"{BDF_WEBSTAT_URL}/{BDF_OAT_SERIES}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params={"lastNObservations": "5", "detail": "dataonly", "format": "jsondata"},
                headers={
                    "Accept": "application/json",
                    "User-Agent": "AuxyVeille/1.0",
                    "Authorization": f"Bearer {api_key}",
                },
                timeout=20.0,
            )
            resp.raise_for_status()
            data = resp.json()

            # Structure JSON SDMX identique à l'ECB
            datasets = data.get("dataSets", [])
            if not datasets:
                logger.warning("BdF OAT : pas de dataset, fallback ECB")
                return await _fetch_oat_fallback()

            series = datasets[0].get("series", {})
            if not series:
                logger.warning("BdF OAT : pas de séries, fallback ECB")
                return await _fetch_oat_fallback()

            first_series = next(iter(series.values()))
            observations = first_series.get("observations", {})
            if not observations:
                logger.warning("BdF OAT : pas d'observations, fallback ECB")
                return await _fetch_oat_fallback()

            sorted_obs = sorted(observations.items(), key=lambda x: int(x[0]))
            values = [float(v[0]) for _, v in sorted_obs if v]

            if len(values) >= 2:
                last_val = values[-1]
                prev_val = values[-2]
                change_bps = round((last_val - prev_val) * 100, 1)
                logger.info("OAT France via BdF Webstat : %.3f%%", last_val)
                return RateData(name=name, value=round(last_val, 3), change_bps=change_bps)
            elif len(values) == 1:
                return RateData(name=name, value=round(values[0], 3), change_bps=None)

    except Exception:
        logger.warning("Erreur BdF Webstat OAT, fallback ECB", exc_info=True)

    return await _fetch_oat_fallback()


async def _fetch_oat_fallback() -> RateData:
    """Fallback : OAT via ECB IRS mensuel (convergence Maastricht)."""
    async with httpx.AsyncClient() as session:
        return await _fetch_ecb_json(
            session, "IRS", "M.FR.L.L40.CI.0000.EUR.N.Z", "OAT France 10Y"
        )


# ---------------------------------------------------------------------------
# yfinance — pour US Treasury
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
    """Récupère OAT France 10Y, Bund Allemagne 10Y, US Treasury 10Y.

    Sources quotidiennes :
    - OAT : Banque de France Webstat (TEC 10), fallback ECB IRS mensuel
    - Bund : Bundesbank BBSIS API (quotidien)
    - US Treasury : yfinance ^TNX (quotidien)
    """
    oat, bund, ust = await asyncio.gather(
        _fetch_bdf_yield(),
        _fetch_bundesbank_yield(),
        _fetch_yf_rate("^TNX", "US Treasury 10Y"),
        return_exceptions=True,
    )

    results: list[RateData] = []
    for r, fallback_name in [
        (oat, "OAT France 10Y"),
        (bund, "Bund Allemagne 10Y"),
        (ust, "US Treasury 10Y"),
    ]:
        if isinstance(r, RateData):
            results.append(r)
        else:
            logger.error("Erreur %s : %s", fallback_name, r)
            results.append(RateData(name=fallback_name, value=None, change_bps=None))

    return results


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
