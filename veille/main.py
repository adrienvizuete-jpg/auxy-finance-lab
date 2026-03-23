"""Orchestrateur principal de la veille quotidienne Auxy Partners."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from veille.config import RECIPIENTS, VeilleConfig, jours_feries
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
    if date_str in jours_feries(dt.year):
        return False
    return True


# Crons du workflow GitHub Actions
_CRON_SUMMER = "30 4 * * 1-5"   # 4:30 UTC = 6:30 CEST (été)
_CRON_WINTER = "30 5 * * 1-5"   # 5:30 UTC = 6:30 CET  (hiver)


def _is_correct_cron_run() -> bool:
    """Vérifie que c'est la bonne exécution cron (gestion DST).

    Utilise la variable CRON_SCHEDULE (= github.event.schedule) plutôt que
    l'heure réelle d'exécution, ce qui rend la vérification insensible aux
    retards de GitHub Actions (qui peuvent atteindre plusieurs heures).

    - CRON_SCHEDULE vide (workflow_dispatch) → toujours exécuter
    - Paris en CEST (UTC+2, été) → accepter uniquement le cron 4:30 UTC
    - Paris en CET  (UTC+1, hiver) → accepter uniquement le cron 5:30 UTC
    """
    schedule = os.environ.get("CRON_SCHEDULE", "").strip()

    # Déclenchement manuel : toujours exécuter
    if not schedule:
        return True

    now_paris = datetime.now(PARIS_TZ)
    utc_offset_hours = now_paris.utcoffset().total_seconds() / 3600

    if utc_offset_hours == 2:
        # Heure d'été (CEST) → accepter le cron 4:30 UTC
        is_correct = schedule == _CRON_SUMMER
    elif utc_offset_hours == 1:
        # Heure d'hiver (CET) → accepter le cron 5:30 UTC
        is_correct = schedule == _CRON_WINTER
    else:
        # Offset inattendu → exécuter par précaution
        logger.warning("Offset Paris inattendu : UTC+%s, exécution forcée.", utc_offset_hours)
        return True

    if not is_correct:
        logger.info(
            "Skip cron '%s' (Paris UTC+%d, attendu '%s').",
            schedule,
            int(utc_offset_hours),
            _CRON_SUMMER if utc_offset_hours == 2 else _CRON_WINTER,
        )

    return is_correct


async def run_veille(config: VeilleConfig, force: bool = False) -> None:
    """Exécute la veille complète : collecte → template → envoi."""
    now = datetime.now(PARIS_TZ)

    if not force:
        if not _is_business_day(now):
            logger.info("Jour non ouvré (%s), skip.", now.strftime("%A %d/%m/%Y"))
            return

        if not _is_correct_cron_run():
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
        fetch_french_news(),
        fetch_regional_news(),
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
