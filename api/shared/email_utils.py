"""Shared email helpers (unsubscribe token/URL) used by the daily recap,
the broadcast drain, and the unsubscribe endpoint."""

import hashlib
import hmac
import os

BASE_URL = 'https://www.stockproai.net'
DAILY_EMAIL_KEY = os.environ.get('DAILY_EMAIL_KEY', '')


def make_unsubscribe_token(email: str) -> str:
    """HMAC-signed unsubscribe token for an email (must match api/unsubscribe)."""
    return hmac.new(
        DAILY_EMAIL_KEY.encode(),
        email.lower().encode(),
        hashlib.sha256,
    ).hexdigest()[:32]


def make_unsubscribe_url(email: str) -> str:
    return f'{BASE_URL}/api/unsubscribe?email={email}&token={make_unsubscribe_token(email)}'
