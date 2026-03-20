"""Template HTML pour l'email de veille quotidienne Auxy Partners."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from veille.market_data import QuoteData, StockMove
from veille.news import NewsItem
from veille.rates import RateData


@dataclass
class VeilleData:
    """Conteneur pour toutes les données de la veille."""
    date: datetime
    indices: list[QuoteData]
    top5: list[StockMove]
    flop5: list[StockMove]
    fx: list[QuoteData]
    rates: list[RateData]
    commodities: list[QuoteData]
    news_france: list[NewsItem]
    news_aura: list[NewsItem]
    errors: list[str]


def _fmt_number(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "—"
    return f"{value:,.{decimals}f}".replace(",", "\u202f")


def _fmt_change(change: float | None, unit: str = "%") -> str:
    if change is None:
        return '<span style="color:#888;">—</span>'
    color = "#27ae60" if change >= 0 else "#e74c3c"
    sign = "+" if change > 0 else ""
    if unit == "bps":
        return f'<span style="color:{color};font-weight:600;">{sign}{change:.1f} bps</span>'
    return f'<span style="color:{color};font-weight:600;">{sign}{change:.2f}%</span>'


def _fmt_change_text(change: float | None) -> str:
    if change is None:
        return "—"
    sign = "+" if change > 0 else ""
    return f"{sign}{change:.2f}%"


def _table_row(cells: list[str], bg: str = "#ffffff") -> str:
    tds = "".join(
        f'<td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;{("text-align:right;" if i > 0 else "")}">{c}</td>'
        for i, c in enumerate(cells)
    )
    return f'<tr style="background:{bg};">{tds}</tr>'


def _render_news_section(items: list[NewsItem]) -> str:
    """Rend une section d'actualités avec titre + résumé 2 lignes."""
    if not items:
        return '<tr><td style="padding:8px 32px;font-size:13px;color:#888;">Aucune actualité disponible.</td></tr>'

    html = '<tr><td style="padding:8px 32px;">'
    for item in items:
        source_tag = f' — <span style="color:#D4AF37;font-weight:600;">{item.source}</span>' if item.source else ""
        html += f"""
<div style="margin-bottom:14px;">
  <a href="{item.url}" style="color:#1B3A5C;text-decoration:none;font-size:13px;font-weight:600;">{item.title}</a>
  <span style="font-size:11px;color:#888;">{source_tag}</span>"""
        if item.summary:
            html += f"""
  <p style="margin:3px 0 0;font-size:12px;color:#666;line-height:1.4;">{item.summary}</p>"""
        html += "\n</div>"
    html += "</td></tr>"
    return html


def render_email(data: VeilleData) -> str:
    """Génère le HTML complet de l'email de veille."""
    date_str = data.date.strftime("%d/%m/%Y")
    day_name = {
        0: "Lundi", 1: "Mardi", 2: "Mercredi",
        3: "Jeudi", 4: "Vendredi", 5: "Samedi", 6: "Dimanche",
    }[data.date.weekday()]

    # --- Header ---
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:20px 0;">
<table width="700" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:#1B3A5C;padding:24px 32px;">
  <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">
    Veille Marchés & Actualités
  </h1>
  <p style="color:#D4AF37;margin:6px 0 0;font-size:14px;font-weight:600;">
    AUXY PARTNERS — {day_name} {date_str}
  </p>
</td></tr>
"""

    # --- Erreurs éventuelles ---
    if data.errors:
        errors_html = "<br>".join(data.errors)
        html += f"""
<tr><td style="padding:12px 32px;">
  <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:10px 14px;font-size:13px;color:#856404;">
    ⚠ {errors_html}
  </div>
</td></tr>
"""

    # === SECTION I : MARCHÉS ===
    html += """
<tr><td style="padding:24px 32px 8px;">
  <h2 style="color:#1B3A5C;font-size:18px;margin:0;border-bottom:2px solid #D4AF37;padding-bottom:6px;">
    I. Cotations de Marché
  </h2>
</td></tr>
"""

    # --- Indices mondiaux ---
    html += """
<tr><td style="padding:8px 32px;">
  <h3 style="color:#1B3A5C;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">
    Indices Mondiaux
  </h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#1B3A5C;">
      <td style="padding:8px 12px;color:#fff;font-weight:600;">Indice</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Clôture</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Variation</td>
    </tr>
"""
    for i, idx in enumerate(data.indices):
        bg = "#f9f9f9" if i % 2 else "#ffffff"
        html += _table_row([
            idx.name,
            _fmt_number(idx.close),
            _fmt_change(idx.change_pct),
        ], bg)

    html += "</table></td></tr>"

    # --- CAC 40 Top 5 / Flop 5 ---
    if data.top5 or data.flop5:
        html += """
<tr><td style="padding:16px 32px 4px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
"""
        # Top 5
        html += """<td width="48%" valign="top">
  <h3 style="color:#27ae60;font-size:14px;margin:0 0 8px;">▲ Top 5 CAC 40</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
"""
        for i, m in enumerate(data.top5):
            bg = "#f0faf0" if i % 2 else "#ffffff"
            html += _table_row([
                m.name,
                _fmt_number(m.close),
                _fmt_change(m.change_pct),
            ], bg)
        html += "</table></td>"

        html += '<td width="4%"></td>'

        # Flop 5
        html += """<td width="48%" valign="top">
  <h3 style="color:#e74c3c;font-size:14px;margin:0 0 8px;">▼ Flop 5 CAC 40</h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
"""
        for i, m in enumerate(data.flop5):
            bg = "#fef5f5" if i % 2 else "#ffffff"
            html += _table_row([
                m.name,
                _fmt_number(m.close),
                _fmt_change(m.change_pct),
            ], bg)
        html += "</table></td>"
        html += "</tr></table></td></tr>"

    # --- Devises ---
    html += """
<tr><td style="padding:16px 32px 8px;">
  <h3 style="color:#1B3A5C;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">
    Devises
  </h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#1B3A5C;">
      <td style="padding:8px 12px;color:#fff;font-weight:600;">Paire</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Cours</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Variation</td>
    </tr>
"""
    for i, pair in enumerate(data.fx):
        bg = "#f9f9f9" if i % 2 else "#ffffff"
        html += _table_row([
            pair.name,
            _fmt_number(pair.close, 4),
            _fmt_change(pair.change_pct),
        ], bg)
    html += "</table></td></tr>"

    # --- Taux ---
    html += """
<tr><td style="padding:16px 32px 8px;">
  <h3 style="color:#1B3A5C;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">
    Taux d'Intérêt
  </h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#1B3A5C;">
      <td style="padding:8px 12px;color:#fff;font-weight:600;">Taux</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Valeur</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Variation</td>
    </tr>
"""
    for i, rate in enumerate(data.rates):
        bg = "#f9f9f9" if i % 2 else "#ffffff"
        val_str = f"{rate.value:.3f}%" if rate.value is not None else "—"
        html += _table_row([
            rate.name,
            val_str,
            _fmt_change(rate.change_bps, unit="bps"),
        ], bg)
    html += "</table></td></tr>"

    # --- Matières premières ---
    html += """
<tr><td style="padding:16px 32px 8px;">
  <h3 style="color:#1B3A5C;font-size:14px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px;">
    Matières Premières
  </h3>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#1B3A5C;">
      <td style="padding:8px 12px;color:#fff;font-weight:600;">Actif</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Prix (USD)</td>
      <td style="padding:8px 12px;color:#fff;font-weight:600;text-align:right;">Variation</td>
    </tr>
"""
    for i, c in enumerate(data.commodities):
        bg = "#f9f9f9" if i % 2 else "#ffffff"
        html += _table_row([
            c.name,
            _fmt_number(c.close),
            _fmt_change(c.change_pct),
        ], bg)
    html += "</table></td></tr>"

    # === SECTION II : NEWS FRANCE ===
    html += """
<tr><td style="padding:24px 32px 8px;">
  <h2 style="color:#1B3A5C;font-size:18px;margin:0;border-bottom:2px solid #D4AF37;padding-bottom:6px;">
    II. Actualités Économiques — France
  </h2>
</td></tr>
"""
    html += _render_news_section(data.news_france)

    # === SECTION III : NEWS AURA ===
    html += """
<tr><td style="padding:24px 32px 8px;">
  <h2 style="color:#1B3A5C;font-size:18px;margin:0;border-bottom:2px solid #D4AF37;padding-bottom:6px;">
    III. Actualités — Auvergne-Rhône-Alpes
  </h2>
</td></tr>
"""
    html += _render_news_section(data.news_aura)

    # --- Footer ---
    html += f"""
<tr><td style="padding:24px 32px;background:#f8f8f8;border-top:1px solid #e8e8e8;">
  <p style="margin:0;font-size:11px;color:#999;text-align:center;">
    Cette veille est générée automatiquement par Auxy Partners.<br>
    Les données de marché proviennent de Yahoo Finance et de la BCE.<br>
    Les actualités proviennent de Les Echos, L'Agefi, Boursorama, Bref Eco et autres sources RSS. Données au {date_str}.
  </p>
</td></tr>

</table>
</td></tr></table>
</body>
</html>"""

    return html
