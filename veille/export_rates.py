"""Export des taux du jour en JSON pour l'app web statique (bandeau « Taux du jour »).

Réutilise les coroutines de veille.rates — les mêmes que celles appelées par
veille.main pour le mail quotidien — et écrit data/rates.json à la racine du
repo. Chaque taux dont la source a échoué est omis du JSON (jamais de null) ;
si aucun taux n'est disponible, le script sort en code 1 sans écrire le
fichier, afin de ne pas écraser un JSON valide existant.

Usage :
    python -m veille.export_rates [sortie.json]
    python veille/export_rates.py [sortie.json]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

# Racine du repo = parent du package veille/ (indépendant du cwd)
REPO_ROOT = Path(__file__).resolve().parent.parent

# Exécution directe (python veille/export_rates.py) : rendre le package importable
if __package__ in (None, ""):
    sys.path.insert(0, str(REPO_ROOT))

from veille.rates import RateData, fetch_all_rates  # noqa: E402

logger = logging.getLogger(__name__)

DEFAULT_OUTPUT = REPO_ROOT / "data" / "rates.json"
SOURCE = "auxy-finance-lab veille"

# Nom RateData (cf. veille/rates.py) -> (clé JSON snake_case, label bandeau)
RATE_KEYS: dict[str, tuple[str, str]] = {
    "Euribor 3M": ("euribor_3m", "Euribor 3M"),
    "Euribor 12M": ("euribor_12m", "Euribor 12M"),
    "OAT France 10Y": ("oat_10y", "OAT 10 ans"),
    "Bund Allemagne 10Y": ("bund_10y", "Bund 10 ans"),
    "US Treasury 10Y": ("ust_10y", "UST 10 ans"),
}


def _slug(name: str) -> str:
    """Clé snake_case de secours si rates.py expose un taux non répertorié."""
    slug = "".join(c if c.isalnum() else "_" for c in name.lower())
    while "__" in slug:
        slug = slug.replace("__", "_")
    return slug.strip("_")


async def collect_rates() -> list[RateData]:
    """Récupère tous les taux via fetch_all_rates (même appel que veille.main).

    fetch_all_rates gère déjà l'erreur source par source — asyncio.gather(...,
    return_exceptions=True) en interne — et renvoie value=None pour chaque
    taux dont la source a échoué. Le gather ci-dessous reproduit le pattern de
    main.py : une exception imprévue ne fait pas planter le script.
    """
    results = await asyncio.gather(fetch_all_rates(), return_exceptions=True)
    if isinstance(results[0], BaseException):
        logger.error("Erreur taux : %s", results[0])
        return []
    return results[0]


def build_payload(rates: list[RateData]) -> dict | None:
    """Construit le payload JSON ; None si aucun taux exploitable."""
    entries: dict[str, dict] = {}
    for rate in rates:
        if rate.value is None or not math.isfinite(rate.value):
            logger.warning("Taux indisponible, clé omise : %s", rate.name)
            continue
        key, label = RATE_KEYS.get(rate.name, (_slug(rate.name), rate.name))
        entries[key] = {
            "label": label,
            "value": round(float(rate.value), 3),
            "unit": "%",
        }

    if not entries:
        return None

    # Ordre stable : clés connues d'abord (ordre RATE_KEYS), puis les autres
    ordered: dict[str, dict] = {}
    for key, _label in RATE_KEYS.values():
        if key in entries:
            ordered[key] = entries.pop(key)
    ordered.update(entries)

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "rates": ordered,
    }


def write_json(payload: dict, output: Path) -> None:
    """Écriture atomique : fichier temporaire puis rename."""
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(output)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Exporte les taux du jour en JSON (bandeau « Taux du jour »)."
    )
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Chemin du JSON de sortie (défaut : {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
    )

    rates = asyncio.run(collect_rates())
    payload = build_payload(rates)

    if payload is None:
        logger.error(
            "Aucun taux récupéré — %s non écrit (fichier existant préservé).",
            args.output,
        )
        return 1

    write_json(payload, args.output)
    logger.info("%d taux exportés vers %s", len(payload["rates"]), args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
