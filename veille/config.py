"""Configuration centrale de la veille quotidienne."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
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

# Flux RSS — Sources AURA (par ordre de priorité)
RSS_FEEDS_AURA: dict[str, str] = {
    "Bref Eco": "https://www.bfreco.com/feed/",
    "Le Journal des Entreprises": "https://www.lejournaldesentreprises.com/rss",
    "Lyon Capitale": "https://www.lyoncapitale.fr/feed/",
    "Le Progrès": "https://www.leprogres.fr/rss",
    "Tribune de Lyon": "https://tribunedelyon.fr/feed/",
}

# Destinataires
RECIPIENTS: list[str] = [
    "adrien.vizuete@auxy-partners.com",
    "yannick.rousset@auxy-partners.com",
]

# Jours fériés français 2026 (dates fixes + calculées)
JOURS_FERIES_2026: list[str] = [
    "2026-01-01",  # Nouvel An
    "2026-04-06",  # Lundi de Pâques
    "2026-05-01",  # Fête du Travail
    "2026-05-08",  # Victoire 1945
    "2026-05-14",  # Ascension
    "2026-05-25",  # Lundi de Pentecôte
    "2026-07-14",  # Fête nationale
    "2026-08-15",  # Assomption
    "2026-11-01",  # Toussaint
    "2026-11-11",  # Armistice
    "2026-12-25",  # Noël
]


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
