"""
Broadcast Queue Drain — pulls a batch of pending broadcast_queue rows,
sends them via Gmail SMTP, marks each one sent or failed, logs telemetry.

POST /api/broadcast-drain?key=$DAILY_EMAIL_KEY[&batch=50]
Triggered by the stockproai-cron Function App's timer (every 30 sec).
Idempotent and concurrency-safe (FOR UPDATE SKIP LOCKED in claim).
"""

import json
import logging
import os
import smtplib
import sys
import traceback
from datetime import date as date_cls
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import azure.functions as func

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.database import (
    claim_broadcast_batch,
    init_schema,
    log_email_send,
    mark_broadcast_failed,
    mark_broadcast_sent,
)


GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
DAILY_EMAIL_KEY = os.environ.get('DAILY_EMAIL_KEY', '')


def _json(payload, status=200):
    return func.HttpResponse(
        json.dumps(payload, default=str),
        status_code=status,
        mimetype='application/json',
    )


def _send(to_email: str, subject: str, body_html: str, body_text: str) -> tuple[bool, str | None]:
    """One SMTP send. Returns (success, error_message)."""
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        return False, "GMAIL_USER / GMAIL_APP_PASSWORD not set"
    try:
        msg = MIMEMultipart('alternative')
        msg['From'] = f'StockPro AI <{GMAIL_USER}>'
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body_text, 'plain'))
        msg.attach(MIMEText(body_html, 'html'))
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        return True, None
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def main(req: func.HttpRequest) -> func.HttpResponse:
    key = req.params.get('key') or req.headers.get('x-diag-key')
    if not DAILY_EMAIL_KEY or key != DAILY_EMAIL_KEY:
        return _json({'error': 'Unauthorized'}, 401)

    try:
        init_schema()
        try:
            batch_size = int(req.params.get('batch', '50'))
        except ValueError:
            batch_size = 50
        batch_size = max(1, min(200, batch_size))

        rows = claim_broadcast_batch(batch_size)
        if not rows:
            return _json({'status': 'idle', 'sent': 0, 'failed': 0, 'claimed': 0})

        sent = 0
        failed = 0
        today = date_cls.today().isoformat()
        for row in rows:
            ok, err = _send(row['email'], row['subject'], row['body_html'], row['body_text'])
            if ok:
                mark_broadcast_sent(str(row['id']))
                sent += 1
                try:
                    log_email_send(row['email'], today, 'sent', None, kind='broadcast')
                except Exception:
                    logging.exception('telemetry log failed (sent)')
            else:
                mark_broadcast_failed(str(row['id']), err or 'unknown')
                failed += 1
                try:
                    log_email_send(row['email'], today, 'failed', err, kind='broadcast')
                except Exception:
                    logging.exception('telemetry log failed (failed)')

        return _json({'status': 'ok', 'claimed': len(rows), 'sent': sent, 'failed': failed})
    except Exception as exc:
        logging.error(f"broadcast-drain error: {exc}\n{traceback.format_exc()}")
        return _json({'error': str(exc), 'trace': traceback.format_exc()}, 500)
