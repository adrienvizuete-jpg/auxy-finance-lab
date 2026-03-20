"""Orchestrateur principal de la veille quotidienne Auxy Partners."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from veille.config import JOURS_FERIES_2026, RECIPIENTS, VeilleConfig
from veille.email_sender import send_email
from veille.market_data import fetch_cac40_movers, fetch_commodities, fetch_fx, fetch_indices
from veille.news import fetch_french_news, fetch_regional_news
from veille.rates import fetch_all_rates
from veille.template import VeilleData, render_email

logger = logging.getLogger(__name__)

PARIS_TZ = ZoneInfo("Europe/Paris")


def _is_business_day(dt: datetime) -> bool:
    """Vérifie que la date est un jour ouvré français."""
    if dt.weekday() >= 5:
        return False
    date_str = dt.strftime("%Y-%m-%d")
    if date_str in JOURS_FERIES_2026:
        return False
    return True


def _is_correct_cron_run(dt: datetime) -> bool:
    """Vérifie que c'est la bonne exécution cron (gestion DST).

    GitHub Actions déclenche deux crons :
    - 4h30 UTC → 6h30 CEST (été) ou 5h30 CET (hiver)
    - 5h30 UTC → 7h30 CEST (été) ou 6h30 CET (hiver)

    On ne doit exécuter que quand il est ~6h30 heure de Paris.
    """
    paris_hour = dt.astimezone(PARIS_TZ).hour
    # Accepter entre 6h et 7h (marge pour le temps d'exécution du job)
    return 6 <= paris_hour <= 7


async def run_veille(config: VeilleConfig, force: bool = False) -> None:
    """Exécute la veille complète : collecte → template → envoi."""
    now = datetime.now(PARIS_TZ)

    if not force:
        if not _is_business_day(now):
            logger.info("Jour non ouvré (%s), skip.", now.strftime("%A %d/%m/%Y"))
            return

        if not _is_correct_cron_run(datetime.now(tz=ZoneInfo("UTC"))):
            logger.info("Pas la bonne exécution cron (heure Paris : %s), skip.", now.strftime("%H:%M"))
            return

    logger.info("=" * 60)
    logger.info("VEILLE QUOTIDIENNE — %s", now.strftime("%A %d/%m/%Y %H:%M"))
    logger.info("=" * 60)

    errors: list[str] = []

    # Récupérer toutes les données en parallèle
    results = await asyncio.gather(
        fetch_indices(),
        fetch_cac40_movers(),
        fetch_fx(),
        fetch_commodities(),
        fetch_all_rates(),
        fetch_french_news(config.gnews_api_key),
        fetch_regional_news(config.gnews_api_key),
        return_exceptions=True,
    )

    # Extraire les résultats avec gestion d'erreurs par section
    indices = results[0] if not isinstance(results[0], BaseException) else []
    if isinstance(results[0], BaseException):
        errors.append("Indices mondiaux indisponibles")
        logger.error("Erreur indices : %s", results[0])

    if isinstance(results[1], BaseException):
        top5, flop5 = [], []
        errors.append("CAC 40 Top/Flop indisponible")
        logger.error("Erreur CAC 40 : %s", results[1])
    else:
        top5, flop5 = results[1]

    fx = results[2] if not isinstance(results[2], BaseException) else []
    if isinstance(results[2], BaseException):
        errors.append("Devises indisponibles")
        logger.error("Erreur FX : %s", results[2])

    commodities = results[3] if not isinstance(results[3], BaseException) else []
    if isinstance(results[3], BaseException):
        errors.append("Matières premières indisponibles")
        logger.error("Erreur commodities : %s", results[3])

    rates = results[4] if not isinstance(results[4], BaseException) else []
    if isinstance(results[4], BaseException):
        errors.append("Taux d'intérêt indisponibles")
        logger.error("Erreur taux : %s", results[4])

    news_france = results[5] if not isinstance(results[5], BaseException) else []
    if isinstance(results[5], BaseException):
        errors.append("Actualités France indisponibles")
        logger.error("Erreur news France : %s", results[5])

    news_aura = results[6] if not isinstance(results[6], BaseException) else []
    if isinstance(results[6], BaseException):
        errors.append("Actualités AURA indisponibles")
        logger.error("Erreur news AURA : %s", results[6])

    # Assembler les données
    data = VeilleData(
        date=now,
        indices=indices,
        top5=top5,
        flop5=flop5,
        fx=fx,
        rates=rates,
        commodities=commodities,
        news_france=news_france,
        news_aura=news_aura,
        errors=errors,
    )

    # Rendre le HTML
    html = render_email(data)

    # Envoyer l'email
    subject = f"Veille Marchés Auxy — {now.strftime('%d/%m/%Y')}"

    logger.info("Envoi de l'email à %d destinataires...", len(RECIPIENTS))
    await send_email(
        subject=subject,
        html_body=html,
        recipients=RECIPIENTS,
        gmail_user=config.gmail_user,
        gmail_app_password=config.gmail_app_password,
    )

    logger.info("Veille terminée avec succès.")
    if errors:
        logger.warning("Sections en erreur : %s", ", ".join(errors))


def cli() -> None:
    """Point d'entrée CLI."""
    parser = argparse.ArgumentParser(
        description="Veille quotidienne marchés & actualités — Auxy Partners"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Exécuter la veille")
    run_parser.add_argument(
        "--force", action="store_true",
        help="Forcer l'exécution (ignorer le check jour ouvré / cron)",
    )

    args = parser.parse_args()

    try:
        config = VeilleConfig()
    except EnvironmentError as e:
        print(f"Erreur de configuration : {e}", file=sys.stderr)
        sys.exit(1)

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.command == "run":
        asyncio.run(run_veille(config, force=args.force))


if __name__ == "__main__":
    cli()
