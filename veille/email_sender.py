"""Envoi d'emails via Gmail SMTP."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate
from pathlib import Path

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465

# Logo Auxy Partners
LOGO_PATH = Path(__file__).parent.parent / "assets" / "logo.png"


async def send_email(
    subject: str,
    html_body: str,
    recipients: list[str],
    gmail_user: str,
    gmail_app_password: str,
) -> None:
    """Envoie un email HTML avec logo intégré via Gmail SMTP (SSL)."""

    def _send() -> None:
        # MIMEMultipart "related" permet d'intégrer des images via CID
        msg = MIMEMultipart("related")
        msg["From"] = formataddr(("Auxy Partners — Veille", gmail_user))
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)

        # Partie HTML
        html_part = MIMEMultipart("alternative")
        html_part.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(html_part)

        # Logo en pièce jointe CID
        if LOGO_PATH.exists():
            with open(LOGO_PATH, "rb") as f:
                logo_data = f.read()
            logo_img = MIMEImage(logo_data, _subtype="png")
            logo_img.add_header("Content-ID", "<auxy-logo>")
            logo_img.add_header("Content-Disposition", "inline", filename="logo.png")
            msg.attach(logo_img)
        else:
            logger.warning("Logo non trouvé : %s", LOGO_PATH)

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(gmail_user, gmail_app_password)
            server.sendmail(gmail_user, recipients, msg.as_string())

        logger.info("Email envoyé à %s", ", ".join(recipients))

    await asyncio.to_thread(_send)
