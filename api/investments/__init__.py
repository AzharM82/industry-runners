"""
Investments API - Stores and retrieves shared portfolio data.
GET: Returns portfolio data (all users)
POST: Saves portfolio data (admin only) + emails subscribers on changes
"""

import json
import os
import base64
import logging
import smtplib
import hashlib
import hmac
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.admin import is_admin
from shared.database import (
    init_schema,
    get_investment_portfolio,
    save_investment_portfolio,
    get_investment_settings,
    save_investment_settings,
    get_paid_subscribers_for_email,
    log_email_send,
)

GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
DAILY_EMAIL_KEY = os.environ.get('DAILY_EMAIL_KEY', '')
BASE_URL = 'https://www.stockproai.net'


def make_unsubscribe_token(email: str) -> str:
    if not DAILY_EMAIL_KEY:
        return ''
    return hmac.new(
        DAILY_EMAIL_KEY.encode(),
        email.lower().encode(),
        hashlib.sha256
    ).hexdigest()[:32]


def get_user_from_auth(req):
    """Extract user info from Azure Static Web Apps auth header."""
    client_principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not client_principal:
        return None
    try:
        decoded = base64.b64decode(client_principal)
        return json.loads(decoded)
    except:
        return None


def send_investment_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via Gmail SMTP."""
    msg = MIMEMultipart('alternative')
    msg['From'] = f'StockPro AI <{GMAIL_USER}>'
    msg['To'] = to_email
    msg['Subject'] = subject
    msg['List-Unsubscribe'] = f'<{BASE_URL}/api/unsubscribe?email={to_email}&token={make_unsubscribe_token(to_email)}>'

    msg.attach(MIMEText(html_body, 'html'))

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        return True
    except Exception as e:
        logging.error(f"Failed to send investment email to {to_email}: {e}")
        return False


def build_investment_change_email(changes: list, stocks_data: list) -> str:
    """Build HTML email body for investment portfolio changes."""
    changes_html = ''.join(f'<li style="padding:4px 0;color:#e2e8f0;">{c}</li>' for c in changes)

    # Build portfolio summary table
    rows_html = ''
    total_invested = 0
    for s in stocks_data:
        stock_invested = sum(b.get('amount', 0) for b in s.get('monthlyBuys', []))
        total_shares = sum(b.get('shares', 0) for b in s.get('monthlyBuys', []))
        avg_price = stock_invested / total_shares if total_shares else 0
        total_invested += stock_invested
        rows_html += f'''<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #374151;color:#f9fafb;font-weight:600;">{s.get('ticker','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #374151;color:#d1d5db;">{s.get('name','')}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #374151;color:#d1d5db;text-align:right;">{total_shares:,.2f}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #374151;color:#d1d5db;text-align:right;">${avg_price:,.2f}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #374151;color:#d1d5db;text-align:right;">${stock_invested:,.2f}</td>
        </tr>'''

    now_str = datetime.utcnow().strftime('%B %d, %Y %I:%M %p UTC')

    return f'''<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#111827;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background-color:#1f2937;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h1 style="color:#f9fafb;margin:0 0 4px 0;font-size:22px;">Investment Portfolio Update</h1>
      <p style="color:#9ca3af;margin:0;font-size:13px;">{now_str}</p>
    </div>

    <div style="background-color:#1f2937;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h2 style="color:#60a5fa;margin:0 0 12px 0;font-size:16px;">What Changed</h2>
      <ul style="margin:0;padding-left:20px;">{changes_html}</ul>
    </div>

    <div style="background-color:#1f2937;border-radius:12px;padding:24px;margin-bottom:16px;">
      <h2 style="color:#60a5fa;margin:0 0 12px 0;font-size:16px;">Current Portfolio</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #4b5563;">
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:12px;">TICKER</th>
            <th style="padding:8px 12px;text-align:left;color:#9ca3af;font-size:12px;">NAME</th>
            <th style="padding:8px 12px;text-align:right;color:#9ca3af;font-size:12px;">SHARES</th>
            <th style="padding:8px 12px;text-align:right;color:#9ca3af;font-size:12px;">AVG PRICE</th>
            <th style="padding:8px 12px;text-align:right;color:#9ca3af;font-size:12px;">INVESTED</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:10px 12px;color:#f9fafb;font-weight:700;border-top:2px solid #4b5563;">Total Invested</td>
            <td style="padding:10px 12px;color:#4ade80;font-weight:700;text-align:right;border-top:2px solid #4b5563;">${total_invested:,.2f}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="text-align:center;padding:16px;color:#6b7280;font-size:12px;">
      <a href="{BASE_URL}/dashboard" style="color:#60a5fa;text-decoration:none;">View Dashboard</a>
      &nbsp;|&nbsp;
      <a href="{BASE_URL}/api/unsubscribe?email={{email}}&token={{token}}" style="color:#6b7280;text-decoration:none;">Unsubscribe</a>
      <br/><br/>
      <span style="color:#4b5563;">StockPro AI &mdash; Long Term Investment Strategy</span>
    </div>
  </div>
</body>
</html>'''


def notify_subscribers(changes: list, stocks_data: list):
    """Send investment change notification email to all paid subscribers."""
    if not changes:
        return

    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logging.warning("SMTP not configured, skipping investment change emails")
        return

    try:
        subscribers = get_paid_subscribers_for_email()
    except Exception as e:
        logging.error(f"Failed to get subscribers for investment email: {e}")
        return

    if not subscribers:
        return

    subject = f"Portfolio Update: {', '.join(changes[:2])}"
    if len(subject) > 78:
        subject = subject[:75] + '...'

    html_template = build_investment_change_email(changes, stocks_data)
    today = datetime.utcnow().strftime('%Y-%m-%d')

    sent = 0
    for sub in subscribers:
        email = sub.get('email', '')
        if not email:
            continue

        # Personalize unsubscribe link
        html = html_template.replace('{email}', email).replace('{token}', make_unsubscribe_token(email))

        ok = send_investment_email(email, subject, html)
        try:
            log_email_send(email, today, 'sent' if ok else 'failed', None if ok else 'SMTP error')
        except Exception:
            pass
        if ok:
            sent += 1

    logging.info(f"Investment change emails: {sent}/{len(subscribers)} sent")


def main(req: func.HttpRequest) -> func.HttpResponse:
    """Handle GET and POST requests for investment data."""
    try:
        # Ensure tables exist
        init_schema()

        if req.method == 'GET':
            stocks = get_investment_portfolio()
            settings = get_investment_settings()

            return func.HttpResponse(
                json.dumps({'stocks': stocks, 'settings': settings}),
                mimetype='application/json'
            )

        elif req.method == 'POST':
            # Only admin can save
            auth_user = get_user_from_auth(req)
            if not auth_user:
                return func.HttpResponse(
                    json.dumps({'error': 'Unauthorized'}),
                    status_code=401,
                    mimetype='application/json'
                )

            user_email = auth_user.get('userDetails', '').lower()
            if not is_admin(user_email):
                return func.HttpResponse(
                    json.dumps({'error': 'Admin access required'}),
                    status_code=403,
                    mimetype='application/json'
                )

            # Get request body
            try:
                body = req.get_json()
            except:
                return func.HttpResponse(
                    json.dumps({'error': 'Invalid JSON body'}),
                    status_code=400,
                    mimetype='application/json'
                )

            # Validate required fields
            if 'stocks' not in body or 'settings' not in body:
                return func.HttpResponse(
                    json.dumps({'error': 'Missing stocks or settings'}),
                    status_code=400,
                    mimetype='application/json'
                )

            # Save stocks to PostgreSQL
            changes = save_investment_portfolio(body['stocks'])

            # Save settings to Redis (lightweight)
            save_investment_settings(body['settings'])

            # Notify subscribers if there were meaningful changes
            if changes:
                try:
                    notify_subscribers(changes, body['stocks'])
                except Exception as e:
                    logging.error(f"Email notification failed: {e}")

            return func.HttpResponse(
                json.dumps({'success': True, 'changes': changes}),
                mimetype='application/json'
            )

        else:
            return func.HttpResponse(
                json.dumps({'error': 'Method not allowed'}),
                status_code=405,
                mimetype='application/json'
            )

    except Exception as e:
        logging.error(f"Investments API error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
