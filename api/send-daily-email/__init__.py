"""
Daily Recap Email — sends a comprehensive market recap to all opted-in paid subscribers.
Triggered by GitHub Actions cron at ~8 PM ET on market days.
Authenticated by DAILY_EMAIL_KEY query parameter.
"""

import json
import os
import logging
import smtplib
import hmac
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_market_summaries, get_paid_subscribers_for_email, init_schema
from shared.cache import get_cached, get_history
from shared.market_calendar import is_market_open
from shared.timezone import today_pst

DAILY_EMAIL_KEY = os.environ.get('DAILY_EMAIL_KEY', '')
GMAIL_USER = os.environ.get('GMAIL_USER', '')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
BASE_URL = 'https://www.stockproai.net'


def make_unsubscribe_token(email: str) -> str:
    """Generate HMAC-signed unsubscribe token for an email."""
    return hmac.new(
        DAILY_EMAIL_KEY.encode(),
        email.lower().encode(),
        hashlib.sha256
    ).hexdigest()[:32]


def markdown_to_html(text: str) -> str:
    """Lightweight markdown to HTML conversion for email."""
    if not text:
        return ''
    lines = text.split('\n')
    html_lines = []
    in_list = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('### '):
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            html_lines.append(f'<h3 style="color:#60a5fa;margin:16px 0 8px 0;font-size:16px;">{stripped[4:]}</h3>')
        elif stripped.startswith('## '):
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            html_lines.append(f'<h2 style="color:#60a5fa;margin:18px 0 8px 0;font-size:18px;">{stripped[3:]}</h2>')
        elif stripped.startswith('**') and stripped.endswith('**'):
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            html_lines.append(f'<p style="color:#e5e7eb;margin:8px 0;"><strong style="color:#f9fafb;">{stripped[2:-2]}</strong></p>')
        elif stripped.startswith('- ') or stripped.startswith('* '):
            if not in_list:
                html_lines.append('<ul style="margin:4px 0;padding-left:20px;">')
                in_list = True
            content = stripped[2:]
            # Handle bold within list items
            import re
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#f9fafb;">\1</strong>', content)
            html_lines.append(f'<li style="color:#d1d5db;margin:2px 0;">{content}</li>')
        elif stripped:
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            import re
            processed = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#f9fafb;">\1</strong>', stripped)
            html_lines.append(f'<p style="color:#d1d5db;margin:6px 0;">{processed}</p>')
        else:
            if in_list:
                html_lines.append('</ul>')
                in_list = False
    if in_list:
        html_lines.append('</ul>')
    return '\n'.join(html_lines)


def color_for_value(val, threshold=0):
    """Return green/red color based on value."""
    try:
        v = float(val)
        return '#4ade80' if v >= threshold else '#f87171'
    except (ValueError, TypeError):
        return '#9ca3af'


def format_pct(val):
    """Format a number as percentage string."""
    try:
        v = float(val)
        sign = '+' if v > 0 else ''
        return f'{sign}{v:.2f}%'
    except (ValueError, TypeError):
        return str(val) if val is not None else 'N/A'


def build_breadth_section(realtime_data, daily_data):
    """Build the market breadth HTML section."""
    if not realtime_data and not daily_data:
        return ''

    rows = ''

    if realtime_data:
        up4 = realtime_data.get('up4Pct', 'N/A')
        down4 = realtime_data.get('down4Pct', 'N/A')
        ratio = realtime_data.get('upDownRatio', 'N/A')
        t2108 = realtime_data.get('t2108', 'N/A')
        rows += f'''
        <tr><td style="padding:6px 12px;color:#9ca3af;">Up &gt;4%</td>
            <td style="padding:6px 12px;color:#4ade80;text-align:right;">{up4}</td>
            <td style="padding:6px 12px;color:#9ca3af;">Down &gt;4%</td>
            <td style="padding:6px 12px;color:#f87171;text-align:right;">{down4}</td></tr>
        <tr><td style="padding:6px 12px;color:#9ca3af;">Up/Down Ratio</td>
            <td style="padding:6px 12px;color:{color_for_value(ratio, 1)};text-align:right;">{ratio}</td>
            <td style="padding:6px 12px;color:#9ca3af;">T2108</td>
            <td style="padding:6px 12px;color:#e5e7eb;text-align:right;">{t2108}</td></tr>
        '''

    if daily_data:
        nh = daily_data.get('newHighs', 'N/A')
        nl = daily_data.get('newLows', 'N/A')
        rsi_above = daily_data.get('rsiAbove70', 'N/A')
        rsi_below = daily_data.get('rsiBelow30', 'N/A')
        sma_above = daily_data.get('aboveSma200', 'N/A')
        sma_below = daily_data.get('belowSma200', 'N/A')
        rows += f'''
        <tr><td style="padding:6px 12px;color:#9ca3af;">52w Highs</td>
            <td style="padding:6px 12px;color:#4ade80;text-align:right;">{nh}</td>
            <td style="padding:6px 12px;color:#9ca3af;">52w Lows</td>
            <td style="padding:6px 12px;color:#f87171;text-align:right;">{nl}</td></tr>
        <tr><td style="padding:6px 12px;color:#9ca3af;">RSI &gt;70</td>
            <td style="padding:6px 12px;color:#4ade80;text-align:right;">{rsi_above}</td>
            <td style="padding:6px 12px;color:#9ca3af;">RSI &lt;30</td>
            <td style="padding:6px 12px;color:#f87171;text-align:right;">{rsi_below}</td></tr>
        <tr><td style="padding:6px 12px;color:#9ca3af;">Above SMA200</td>
            <td style="padding:6px 12px;color:#4ade80;text-align:right;">{sma_above}</td>
            <td style="padding:6px 12px;color:#9ca3af;">Below SMA200</td>
            <td style="padding:6px 12px;color:#f87171;text-align:right;">{sma_below}</td></tr>
        '''

    if not rows:
        return ''

    return f'''
    <div style="margin:24px 0;">
      <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">Market Breadth</h2>
      <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
        {rows}
      </table>
    </div>
    '''


def build_sector_section(sector_data):
    """Build the sector rotation HTML section."""
    if not sector_data:
        return ''

    sectors = sector_data.get('sectors', [])
    if not sectors:
        return ''

    rows = ''
    for s in sectors:
        name = s.get('name', '')
        avg_change = s.get('avgChange', 0)
        nh = s.get('newHighs', 0)
        nl = s.get('newLows', 0)
        pct = format_pct(avg_change)
        clr = color_for_value(avg_change)
        rows += f'''
        <tr style="border-bottom:1px solid #374151;">
          <td style="padding:6px 12px;color:#e5e7eb;">{name}</td>
          <td style="padding:6px 12px;color:{clr};text-align:right;">{pct}</td>
          <td style="padding:6px 12px;color:#4ade80;text-align:center;">{nh}</td>
          <td style="padding:6px 12px;color:#f87171;text-align:center;">{nl}</td>
        </tr>
        '''

    return f'''
    <div style="margin:24px 0;">
      <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">Sector Rotation</h2>
      <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
        <tr style="border-bottom:1px solid #4b5563;">
          <th style="padding:8px 12px;color:#9ca3af;text-align:left;font-weight:600;">Sector</th>
          <th style="padding:8px 12px;color:#9ca3af;text-align:right;font-weight:600;">Avg Change</th>
          <th style="padding:8px 12px;color:#9ca3af;text-align:center;font-weight:600;">NH</th>
          <th style="padding:8px 12px;color:#9ca3af;text-align:center;font-weight:600;">NL</th>
        </tr>
        {rows}
      </table>
    </div>
    '''


def build_heatmap_section(rt_history, daily_history):
    """Build 5-day breadth heatmap section."""
    if not rt_history and not daily_history:
        return ''

    # Merge data by date
    date_data = {}
    for entry in (rt_history or []):
        d = entry.get('date', '')
        if d:
            date_data.setdefault(d, {}).update(entry.get('data', {}))
    for entry in (daily_history or []):
        d = entry.get('date', '')
        if d:
            date_data.setdefault(d, {}).update(entry.get('data', {}))

    if not date_data:
        return ''

    sorted_dates = sorted(date_data.keys(), reverse=True)[:5]

    # Build header row
    date_headers = ''.join(
        f'<th style="padding:6px 8px;color:#9ca3af;text-align:center;font-size:12px;">{d[5:]}</th>'
        for d in sorted_dates
    )

    # Metrics to show
    metrics = [
        ('up4Pct', 'Up >4%', True),
        ('down4Pct', 'Down >4%', False),
        ('upDownRatio', 'Up/Down Ratio', True),
        ('newHighs', '52w Highs', True),
        ('newLows', '52w Lows', False),
    ]

    rows = ''
    for key, label, green_is_good in metrics:
        cells = ''
        for d in sorted_dates:
            val = date_data[d].get(key, '')
            if val != '' and val is not None:
                try:
                    v = float(val)
                    if green_is_good:
                        bg = '#064e3b' if v > 0 else '#7f1d1d'
                    else:
                        bg = '#7f1d1d' if v > 0 else '#064e3b'
                except (ValueError, TypeError):
                    bg = '#1f2937'
                cells += f'<td style="padding:6px 8px;text-align:center;background:{bg};color:#e5e7eb;font-size:12px;">{val}</td>'
            else:
                cells += '<td style="padding:6px 8px;text-align:center;background:#1f2937;color:#6b7280;font-size:12px;">-</td>'
        rows += f'''
        <tr style="border-bottom:1px solid #374151;">
          <td style="padding:6px 8px;color:#9ca3af;font-size:12px;">{label}</td>
          {cells}
        </tr>
        '''

    return f'''
    <div style="margin:24px 0;">
      <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">5-Day Breadth Heatmap</h2>
      <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
        <tr style="border-bottom:1px solid #4b5563;">
          <th style="padding:6px 8px;color:#9ca3af;text-align:left;font-size:12px;">Metric</th>
          {date_headers}
        </tr>
        {rows}
      </table>
    </div>
    '''


def build_top_bottom_section(title, groups, key_field, top_n=5):
    """Build top/bottom N groups section (used for swing & day trade)."""
    if not groups:
        return ''

    sorted_groups = sorted(groups, key=lambda g: g.get(key_field, 0), reverse=True)
    top = sorted_groups[:top_n]
    bottom = sorted_groups[-top_n:] if len(sorted_groups) > top_n else []

    def make_rows(items, label_prefix):
        rows = ''
        for g in items:
            name = g.get('name', g.get('etf', ''))
            val = g.get(key_field, 0)
            pct = format_pct(val)
            clr = color_for_value(val)
            rows += f'''
            <tr style="border-bottom:1px solid #374151;">
              <td style="padding:6px 12px;color:#e5e7eb;">{name}</td>
              <td style="padding:6px 12px;color:{clr};text-align:right;">{pct}</td>
            </tr>
            '''
        return rows

    top_rows = make_rows(top, 'Top')
    bottom_rows = make_rows(bottom, 'Bottom') if bottom else ''

    bottom_section = ''
    if bottom_rows:
        bottom_section = f'''
        <h3 style="color:#f87171;font-size:14px;margin:16px 0 8px 0;">Bottom {top_n}</h3>
        <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
          <tr style="border-bottom:1px solid #4b5563;">
            <th style="padding:6px 12px;color:#9ca3af;text-align:left;">Name</th>
            <th style="padding:6px 12px;color:#9ca3af;text-align:right;">Change</th>
          </tr>
          {bottom_rows}
        </table>
        '''

    return f'''
    <div style="margin:24px 0;">
      <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">{title}</h2>
      <h3 style="color:#4ade80;font-size:14px;margin:0 0 8px 0;">Top {top_n}</h3>
      <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
        <tr style="border-bottom:1px solid #4b5563;">
          <th style="padding:6px 12px;color:#9ca3af;text-align:left;">Name</th>
          <th style="padding:6px 12px;color:#9ca3af;text-align:right;">Change</th>
        </tr>
        {top_rows}
      </table>
      {bottom_section}
    </div>
    '''


def build_email_html(date_str, summary_text, breadth_rt, breadth_daily,
                     sector_data, rt_history, daily_history, daytrade_data,
                     unsubscribe_url):
    """Build the complete HTML email."""
    # Header
    header = f'''
    <div style="background:#1e40af;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
      <h1 style="color:#ffffff;margin:0;font-size:24px;">StockPro AI Daily Recap</h1>
      <p style="color:#bfdbfe;margin:8px 0 0 0;font-size:14px;">{date_str}</p>
    </div>
    '''

    # Market Summary
    summary_section = ''
    if summary_text:
        summary_html = markdown_to_html(summary_text)
        summary_section = f'''
        <div style="margin:24px 0;">
          <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">Market Summary</h2>
          <div style="background:#1f2937;padding:16px;border-radius:8px;">
            {summary_html}
          </div>
        </div>
        '''

    # Breadth
    breadth_section = build_breadth_section(breadth_rt, breadth_daily)

    # Sector Rotation
    sector_section = build_sector_section(sector_data)

    # 5-Day Heatmap
    heatmap_section = build_heatmap_section(rt_history, daily_history)

    # Day Trade Top/Bottom
    daytrade_section = ''
    if daytrade_data:
        groups = daytrade_data.get('groups', [])
        if groups:
            daytrade_section = build_top_bottom_section(
                'Day Trading — Top/Bottom Industry Groups',
                groups, 'avgChange', 5
            )

    # Footer
    footer = f'''
    <div style="margin-top:32px;padding:16px;border-top:1px solid #374151;text-align:center;">
      <p style="color:#6b7280;font-size:12px;margin:0;">
        You received this because you subscribed to StockPro AI daily recaps.
      </p>
      <p style="color:#6b7280;font-size:12px;margin:8px 0 0 0;">
        <a href="{unsubscribe_url}" style="color:#60a5fa;text-decoration:underline;">Unsubscribe</a>
        &nbsp;|&nbsp;
        <a href="{BASE_URL}/dashboard" style="color:#60a5fa;text-decoration:underline;">Open Dashboard</a>
      </p>
      <p style="color:#4b5563;font-size:11px;margin:12px 0 0 0;">
        This is not financial advice. Past performance does not guarantee future results.
      </p>
    </div>
    '''

    return f'''<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#111827;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:16px;">
    {header}
    <div style="background:#111827;padding:0 16px;">
      {summary_section}
      {breadth_section}
      {sector_section}
      {heatmap_section}
      {daytrade_section}
      {footer}
    </div>
  </div>
</body>
</html>'''


def send_email(to_email: str, subject: str, html_body: str) -> bool:
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
        logging.error(f"Failed to send email to {to_email}: {e}")
        return False


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Validate API key
        key = req.params.get('key', '')
        if not DAILY_EMAIL_KEY or key != DAILY_EMAIL_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized'}),
                status_code=401,
                mimetype='application/json'
            )

        # Validate SMTP config
        if not GMAIL_USER or not GMAIL_APP_PASSWORD:
            return func.HttpResponse(
                json.dumps({'error': 'GMAIL_USER or GMAIL_APP_PASSWORD not configured'}),
                status_code=500,
                mimetype='application/json'
            )

        # Test mode: bypass market check and send to a specific email
        test_email = req.params.get('test', '')

        # Check if market was open today (skip in test mode)
        today = today_pst()
        if not test_email and not is_market_open(today):
            return func.HttpResponse(
                json.dumps({'message': f'Market was closed on {today}, no email sent'}),
                mimetype='application/json'
            )

        # Initialize schema
        init_schema()

        # Gather data (uses last cached/saved data, which is Friday's)
        logging.info("Gathering email data...")

        # Market summary
        summaries = get_market_summaries(limit=1)
        summary_text = summaries[0]['summary_text'] if summaries else None

        # Breadth data
        breadth_rt = get_cached('breadth:realtime')
        breadth_daily = get_cached('breadth:daily')

        # Breadth history
        rt_history = get_history('breadth:realtime', 5)
        daily_history = get_history('breadth:daily', 5)

        # Sector rotation
        sector_data = get_cached('sector-rotation:daily')

        # Day trade data
        daytrade_data = get_cached('daytrade:realtime')

        # In test mode, send only to the specified email
        if test_email:
            subscribers = [{'email': test_email, 'name': 'Test User'}]
        else:
            subscribers = get_paid_subscribers_for_email()

        total = len(subscribers)
        logging.info(f"Found {total} {'test' if test_email else 'opted-in'} subscribers")

        if total == 0:
            return func.HttpResponse(
                json.dumps({'message': 'No opted-in subscribers', 'sent': 0, 'total': 0, 'errors': 0}),
                mimetype='application/json'
            )

        # Format date for email subject
        date_display = datetime.strptime(today, '%Y-%m-%d').strftime('%B %d, %Y')
        subject = f'StockPro AI Daily Recap — {date_display}'

        # Send emails
        sent = 0
        errors = 0
        error_list = []

        for sub in subscribers:
            email = sub['email']
            try:
                unsub_url = f'{BASE_URL}/api/unsubscribe?email={email}&token={make_unsubscribe_token(email)}'
                html = build_email_html(
                    date_display, summary_text,
                    breadth_rt, breadth_daily,
                    sector_data, rt_history, daily_history,
                    daytrade_data, unsub_url
                )
                if send_email(email, subject, html):
                    sent += 1
                    logging.info(f"Sent email to {email}")
                else:
                    errors += 1
                    error_list.append(email)
            except Exception as e:
                errors += 1
                error_list.append(email)
                logging.error(f"Error sending to {email}: {e}")

        result = {
            'sent': sent,
            'total': total,
            'errors': errors,
            'date': today
        }
        if error_list:
            result['failed_emails'] = error_list

        logging.info(f"Daily email complete: {sent}/{total} sent, {errors} errors")
        return func.HttpResponse(
            json.dumps(result),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Daily email error: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
