"""Récupération des données de marché via yfinance (téléchargement individuel)."""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass

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


def _fetch_single(symbol: str) -> tuple[float | None, float | None]:
    """Télécharge un ticker individuel et retourne (close, change_pct)."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="5d")
        if hist is None or hist.empty:
            return None, None

        # Filtrer les NaN
        hist = hist.dropna(subset=["Close"])
        if len(hist) < 1:
            return None, None

        last = float(hist["Close"].iloc[-1])
        if math.isnan(last):
            return None, None

        if len(hist) >= 2:
            prev = float(hist["Close"].iloc[-2])
            if math.isnan(prev) or prev == 0:
                return last, None
            change = round(((last - prev) / prev) * 100, 2)
            return last, change

        return last, None
    except Exception:
        logger.warning("Erreur téléchargement %s", symbol)
        return None, None


async def _fetch_single_async(symbol: str) -> tuple[float | None, float | None]:
    """Wrapper async pour le téléchargement individuel."""
    return await asyncio.to_thread(_fetch_single, symbol)


async def fetch_indices() -> list[QuoteData]:
    """Récupère les indices mondiaux."""
    results: list[QuoteData] = []
    tasks = []
    names = list(GLOBAL_INDICES.keys())
    symbols = list(GLOBAL_INDICES.values())

    for symbol in symbols:
        tasks.append(_fetch_single_async(symbol))

    fetched = await asyncio.gather(*tasks, return_exceptions=True)

    for name, result in zip(names, fetched):
        if isinstance(result, BaseException):
            logger.warning("Erreur indice %s : %s", name, result)
            results.append(QuoteData(name=name, close=None, change_pct=None))
        else:
            close, change = result
            results.append(QuoteData(name=name, close=close, change_pct=change))

    return results


async def fetch_cac40_movers() -> tuple[list[StockMove], list[StockMove]]:
    """Récupère le Top 5 et Flop 5 du CAC 40."""
    tickers = list(CAC40_TICKERS.keys())
    tasks = [_fetch_single_async(t) for t in tickers]
    fetched = await asyncio.gather(*tasks, return_exceptions=True)

    moves: list[StockMove] = []
    for ticker, result in zip(tickers, fetched):
        if isinstance(result, BaseException):
            continue
        close, change = result
        if change is not None and close is not None:
            moves.append(StockMove(
                ticker=ticker,
                name=CAC40_TICKERS[ticker],
                close=close,
                change_pct=change,
            ))

    moves.sort(key=lambda m: m.change_pct, reverse=True)
    top5 = moves[:5]
    flop5 = sorted(moves[-5:], key=lambda m: m.change_pct)
    return top5, flop5


async def fetch_fx() -> list[QuoteData]:
    """Récupère les principales paires de devises."""
    results: list[QuoteData] = []
    names = list(FX_PAIRS.keys())
    symbols = list(FX_PAIRS.values())
    tasks = [_fetch_single_async(s) for s in symbols]
    fetched = await asyncio.gather(*tasks, return_exceptions=True)

    for name, result in zip(names, fetched):
        if isinstance(result, BaseException):
            results.append(QuoteData(name=name, close=None, change_pct=None))
        else:
            close, change = result
            results.append(QuoteData(name=name, close=close, change_pct=change))

    return results


async def fetch_commodities() -> list[QuoteData]:
    """Récupère les matières premières."""
    results: list[QuoteData] = []
    names = list(COMMODITIES.keys())
    symbols = list(COMMODITIES.values())
    tasks = [_fetch_single_async(s) for s in symbols]
    fetched = await asyncio.gather(*tasks, return_exceptions=True)

    for name, result in zip(names, fetched):
        if isinstance(result, BaseException):
            results.append(QuoteData(name=name, close=None, change_pct=None))
        else:
            close, change = result
            results.append(QuoteData(name=name, close=close, change_pct=change, currency="USD"))

    return results
