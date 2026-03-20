"""Envoi d'emails via Gmail SMTP."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465


async def send_email(
    subject: str,
    html_body: str,
    recipients: list[str],
    gmail_user: str,
    gmail_app_password: str,
) -> None:
    """Envoie un email HTML via Gmail SMTP (SSL)."""

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["From"] = formataddr(("Auxy Partners — Veille", gmail_user))
        msg["To"] = ", ".join(recipients)
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)

        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(gmail_user, gmail_app_password)
            server.sendmail(gmail_user, recipients, msg.as_string())

        logger.info("Email envoyé à %s", ", ".join(recipients))

    await asyncio.to_thread(_send)
