"""Configuration centrale de la veille quotidienne."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

# ---------------------------------------------------------------------------
# Constantes marché
# ---------------------------------------------------------------------------

# Indices mondiaux — {nom affiché: ticker yfinance}
GLOBAL_INDICES: dict[str, str] = {
    "CAC 40": "^FCHI",
    "DAX": "^GDAXI",
    "FTSE 100": "^FTSE",
    "S&P 500": "^GSPC",
    "Nasdaq": "^IXIC",
    "Nikkei 225": "^N225",
    "Hang Seng": "^HSI",
}

# Composantes CAC 40 (Euronext Paris) — mise à jour mars 2026
CAC40_TICKERS: dict[str, str] = {
    "AI.PA": "Air Liquide",
    "AIR.PA": "Airbus",
    "ALO.PA": "Alstom",
    "MT.PA": "ArcelorMittal",
    "CS.PA": "AXA",
    "BNP.PA": "BNP Paribas",
    "EN.PA": "Bouygues",
    "CAP.PA": "Capgemini",
    "CA.PA": "Carrefour",
    "ACA.PA": "Crédit Agricole",
    "BN.PA": "Danone",
    "DSY.PA": "Dassault Systèmes",
    "ENGI.PA": "Engie",
    "EL.PA": "EssilorLuxottica",
    "ERF.PA": "Eurofins Scientific",
    "RMS.PA": "Hermès",
    "KER.PA": "Kering",
    "LR.PA": "Legrand",
    "OR.PA": "L'Oréal",
    "MC.PA": "LVMH",
    "ML.PA": "Michelin",
    "ORA.PA": "Orange",
    "RI.PA": "Pernod Ricard",
    "PUB.PA": "Publicis",
    "RNO.PA": "Renault",
    "SAF.PA": "Safran",
    "SGO.PA": "Saint-Gobain",
    "SAN.PA": "Sanofi",
    "SU.PA": "Schneider Electric",
    "GLE.PA": "Société Générale",
    "STLAP.PA": "Stellantis",
    "STMPA.PA": "STMicroelectronics",
    "TEP.PA": "Teleperformance",
    "HO.PA": "Thales",
    "TTE.PA": "TotalEnergies",
    "URW.PA": "Unibail-Rodamco",
    "VIE.PA": "Veolia",
    "DG.PA": "Vinci",
    "VIV.PA": "Vivendi",
    "WLN.PA": "Worldline",
}

# Paires de devises
FX_PAIRS: dict[str, str] = {
    "EUR/USD": "EURUSD=X",
    "EUR/GBP": "EURGBP=X",
    "EUR/JPY": "EURJPY=X",
    "EUR/CHF": "EURCHF=X",
    "USD/JPY": "USDJPY=X",
    "EUR/CNY": "EURCNY=X",
}

# Matières premières
COMMODITIES: dict[str, str] = {
    "Pétrole Brent": "BZ=F",
    "Pétrole WTI": "CL=F",
    "Or": "GC=F",
    "Argent": "SI=F",
}

# Taux obligataires via yfinance
BOND_TICKERS: dict[str, str] = {
    "US Treasury 10Y": "^TNX",
}

# URLs
ECB_DATA_URL = "https://data-api.ecb.europa.eu/service/data"

# Flux RSS — Sources France (économie / finance / entreprises)
RSS_FEEDS_FRANCE: dict[str, str] = {
    "Les Echos": "https://www.lesechos.fr/rss/rss_en_continu.xml",
    "L'Agefi": "https://www.agefi.fr/rss",
    "Boursorama": "https://www.boursorama.com/rss/actualites",
    "Yahoo Finance": "https://fr.finance.yahoo.com/rss/topfinstories",
    "BFM Business": "https://bfmbusiness.bfmtv.com/rss/info/flux-rss/flux-toutes-les-actualites/",
}

# Flux RSS — Sources AURA (sources business uniquement)
RSS_FEEDS_AURA: dict[str, str] = {
    "Bref Eco": "https://www.bfreco.com/feed/",
    "Le Journal des Entreprises": "https://www.lejournaldesentreprises.com/rss",
    "Lyon Capitale Économie": "https://www.lyoncapitale.fr/economie/feed/",
    "Tribune de Lyon": "https://tribunedelyon.fr/category/economie/feed/",
}

# Destinataires
RECIPIENTS: list[str] = [
    "adrien.vizuete@auxy-partners.com",
    "yannick.rousset@auxy-partners.com",
]

def _easter(year: int) -> date:
    """Calcul de la date de Pâques (algorithme de Butcher/Meeus)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def jours_feries(year: int) -> set[str]:
    """Retourne l'ensemble des jours fériés français pour une année donnée."""
    paques = _easter(year)
    feries = [
        date(year, 1, 1),       # Nouvel An
        paques + timedelta(days=1),   # Lundi de Pâques
        date(year, 5, 1),       # Fête du Travail
        date(year, 5, 8),       # Victoire 1945
        paques + timedelta(days=39),  # Ascension
        paques + timedelta(days=50),  # Lundi de Pentecôte
        date(year, 7, 14),      # Fête nationale
        date(year, 8, 15),      # Assomption
        date(year, 11, 1),      # Toussaint
        date(year, 11, 11),     # Armistice
        date(year, 12, 25),     # Noël
    ]
    return {d.isoformat() for d in feries}


# ---------------------------------------------------------------------------
# Configuration chargée depuis l'environnement
# ---------------------------------------------------------------------------


def _env(key: str, default: str | None = None, required: bool = True) -> str:
    val = os.getenv(key, default)
    if required and not val:
        raise EnvironmentError(f"Variable d'environnement manquante : {key}")
    return val or ""


@dataclass(frozen=True)
class VeilleConfig:
    gmail_user: str = field(default_factory=lambda: _env("GMAIL_USER"))
    gmail_app_password: str = field(default_factory=lambda: _env("GMAIL_APP_PASSWORD"))
    log_level: str = field(default_factory=lambda: _env("LOG_LEVEL", default="INFO", required=False))
