"""Récupération des données de marché via yfinance."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime

import yfinance as yf

from veille.config import CAC40_TICKERS, COMMODITIES, FX_PAIRS, GLOBAL_INDICES

logger = logging.getLogger(__name__)


@dataclass
class QuoteData:
    """Cotation d'un actif."""
    name: str
    close: float | None
    change_pct: float | None
    currency: str = ""


@dataclass
class StockMove:
    """Mouvement d'une action (Top/Flop)."""
    ticker: str
    name: str
    close: float | None
    change_pct: float


def _compute_change(hist) -> tuple[float | None, float | None]:
    """Calcule le dernier cours de clôture et la variation % à partir d'un historique yfinance."""
    if hist is None or hist.empty or len(hist) < 2:
        if hist is not None and not hist.empty and len(hist) == 1:
            close_col = "Close"
            return float(hist[close_col].iloc[-1]), None
        return None, None

    close_col = "Close"
    last = float(hist[close_col].iloc[-1])
    prev = float(hist[close_col].iloc[-2])
    if prev == 0:
        return last, None
    change = ((last - prev) / prev) * 100
    return last, round(change, 2)


async def fetch_indices() -> list[QuoteData]:
    """Récupère les indices mondiaux."""
    tickers = list(GLOBAL_INDICES.values())
    names = list(GLOBAL_INDICES.keys())

    def _download():
        try:
            data = yf.download(tickers, period="5d", progress=False, group_by="ticker")
            return data
        except Exception:
            logger.exception("Erreur téléchargement indices")
            return None

    data = await asyncio.to_thread(_download)
    results: list[QuoteData] = []

    for ticker, name in zip(tickers, names):
        try:
            if len(tickers) == 1:
                hist = data
            else:
                hist = data[ticker] if ticker in data.columns.get_level_values(0) else None
            close, change = _compute_change(hist)
            results.append(QuoteData(name=name, close=close, change_pct=change))
        except Exception:
            logger.warning("Impossible de récupérer %s (%s)", name, ticker)
            results.append(QuoteData(name=name, close=None, change_pct=None))

    return results


async def fetch_cac40_movers() -> tuple[list[StockMove], list[StockMove]]:
    """Récupère le Top 5 et Flop 5 du CAC 40."""
    tickers = list(CAC40_TICKERS.keys())

    def _download():
        try:
            data = yf.download(tickers, period="5d", progress=False, group_by="ticker")
            return data
        except Exception:
            logger.exception("Erreur téléchargement CAC 40")
            return None

    data = await asyncio.to_thread(_download)
    if data is None or data.empty:
        return [], []

    moves: list[StockMove] = []
    for ticker in tickers:
        try:
            hist = data[ticker] if ticker in data.columns.get_level_values(0) else None
            close, change = _compute_change(hist)
            if change is not None:
                moves.append(StockMove(
                    ticker=ticker,
                    name=CAC40_TICKERS[ticker],
                    close=close,
                    change_pct=change,
                ))
        except Exception:
            logger.debug("Pas de données pour %s", ticker)

    moves.sort(key=lambda m: m.change_pct, reverse=True)
    top5 = moves[:5]
    flop5 = sorted(moves[-5:], key=lambda m: m.change_pct)
    return top5, flop5


async def fetch_fx() -> list[QuoteData]:
    """Récupère les principales paires de devises."""
    tickers = list(FX_PAIRS.values())
    names = list(FX_PAIRS.keys())

    def _download():
        try:
            return yf.download(tickers, period="5d", progress=False, group_by="ticker")
        except Exception:
            logger.exception("Erreur téléchargement FX")
            return None

    data = await asyncio.to_thread(_download)
    results: list[QuoteData] = []

    for ticker, name in zip(tickers, names):
        try:
            if len(tickers) == 1:
                hist = data
            else:
                hist = data[ticker] if ticker in data.columns.get_level_values(0) else None
            close, change = _compute_change(hist)
            results.append(QuoteData(name=name, close=close, change_pct=change))
        except Exception:
            logger.warning("Impossible de récupérer %s", name)
            results.append(QuoteData(name=name, close=None, change_pct=None))

    return results


async def fetch_commodities() -> list[QuoteData]:
    """Récupère les matières premières."""
    tickers = list(COMMODITIES.values())
    names = list(COMMODITIES.keys())

    def _download():
        try:
            return yf.download(tickers, period="5d", progress=False, group_by="ticker")
        except Exception:
            logger.exception("Erreur téléchargement commodities")
            return None

    data = await asyncio.to_thread(_download)
    results: list[QuoteData] = []

    for ticker, name in zip(tickers, names):
        try:
            if len(tickers) == 1:
                hist = data
            else:
                hist = data[ticker] if ticker in data.columns.get_level_values(0) else None
            close, change = _compute_change(hist)
            currency = "USD"
            results.append(QuoteData(name=name, close=close, change_pct=change, currency=currency))
        except Exception:
            logger.warning("Impossible de récupérer %s", name)
            results.append(QuoteData(name=name, close=None, change_pct=None))

    return results
