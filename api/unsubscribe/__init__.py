"""
Unsubscribe endpoint — validates HMAC token and updates email_opt_out.
Returns an HTML confirmation page (clicked from email links).
Supports ?action=resubscribe to re-enable emails.
"""

import os
import hmac
import hashlib
import logging

import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import update_email_opt_out, get_user_by_email, init_schema

DAILY_EMAIL_KEY = os.environ.get('DAILY_EMAIL_KEY', '')


def verify_token(email: str, token: str) -> bool:
    """Verify HMAC unsubscribe token."""
    if not DAILY_EMAIL_KEY or not email or not token:
        return False
    expected = hmac.new(
        DAILY_EMAIL_KEY.encode(),
        email.lower().encode(),
        hashlib.sha256
    ).hexdigest()[:32]
    return hmac.compare_digest(expected, token)


def html_page(title: str, message: str, success: bool = True) -> str:
    """Build a simple HTML confirmation page."""
    icon = '&#10003;' if success else '&#10007;'
    color = '#4ade80' if success else '#f87171'
    return f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>{title} - StockPro AI</title>
</head>
<body style="margin:0;padding:0;background:#111827;font-family:Arial,Helvetica,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#1f2937;padding:48px;border-radius:12px;text-align:center;max-width:480px;margin:16px;">
    <div style="font-size:48px;color:{color};margin-bottom:16px;">{icon}</div>
    <h1 style="color:#f9fafb;font-size:24px;margin:0 0 12px 0;">{title}</h1>
    <p style="color:#d1d5db;font-size:16px;margin:0 0 24px 0;">{message}</p>
    <a href="https://www.stockproai.net/dashboard"
       style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;">
      Go to Dashboard
    </a>
  </div>
</body>
</html>'''


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        email = req.params.get('email', '').strip().lower()
        token = req.params.get('token', '').strip()
        action = req.params.get('action', '').strip()

        if not email or not token:
            return func.HttpResponse(
                html_page('Invalid Link', 'The unsubscribe link is missing required parameters.', False),
                mimetype='text/html',
                status_code=400
            )

        if not verify_token(email, token):
            return func.HttpResponse(
                html_page('Invalid Link', 'This unsubscribe link is invalid or has expired.', False),
                mimetype='text/html',
                status_code=403
            )

        init_schema()

        user = get_user_by_email(email)
        if not user:
            return func.HttpResponse(
                html_page('User Not Found', 'We could not find an account with this email address.', False),
                mimetype='text/html',
                status_code=404
            )

        if action == 'resubscribe':
            update_email_opt_out(email, False)
            return func.HttpResponse(
                html_page('Re-subscribed!', 'You will now receive daily recap emails from StockPro AI.'),
                mimetype='text/html'
            )
        else:
            update_email_opt_out(email, True)
            resubscribe_url = f'https://www.stockproai.net/api/unsubscribe?email={email}&token={token}&action=resubscribe'
            return func.HttpResponse(
                html_page(
                    'Unsubscribed',
                    f'You will no longer receive daily recap emails. '
                    f'<a href="{resubscribe_url}" style="color:#60a5fa;">Click here to re-subscribe</a>.'
                ),
                mimetype='text/html'
            )

    except Exception as e:
        logging.error(f"Unsubscribe error: {e}")
        return func.HttpResponse(
            html_page('Error', 'Something went wrong. Please try again later.', False),
            mimetype='text/html',
            status_code=500
        )
