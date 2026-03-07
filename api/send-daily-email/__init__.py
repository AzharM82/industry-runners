"""
Daily Recap Email — sends a comprehensive market recap to all opted-in paid subscribers.
Triggered by GitHub Actions cron at ~8 PM ET on market days.
Authenticated by DAILY_EMAIL_KEY query parameter.
"""

import json
import os
import re
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


def markdown_to_html(text: str) -> str:
    """Lightweight markdown to HTML conversion for email.
    Detects table-like patterns (e.g. Index Scorecard) and renders as HTML tables.
    """
    if not text:
        return ''

    lines = text.split('\n')
    html_lines = []
    in_list = False
    in_table = False
    table_rows = []

    def flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            return
        # Build HTML table
        header = table_rows[0]
        body = table_rows[1:]
        hcells = ''.join(
            f'<th style="padding:6px 10px;color:#9ca3af;text-align:left;border-bottom:1px solid #4b5563;">{c.strip()}</th>'
            for c in header
        )
        rows_html = ''
        for row in body:
            cells = ''
            for i, c in enumerate(row):
                c = c.strip()
                # Color-code percentage-like values
                clr = '#e5e7eb'
                if i > 0 and c:
                    clr_match = re.search(r'[+-]?\d+\.?\d*%', c)
                    if clr_match:
                        try:
                            v = float(clr_match.group().replace('%', ''))
                            clr = '#4ade80' if v >= 0 else '#f87171'
                        except ValueError:
                            pass
                cells += f'<td style="padding:6px 10px;color:{clr};border-bottom:1px solid #374151;">{c}</td>'
            rows_html += f'<tr>{cells}</tr>'
        html_lines.append(
            f'<table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;margin:8px 0;">'
            f'<tr>{hcells}</tr>{rows_html}</table>'
        )
        table_rows = []
        in_table = False

    for line in lines:
        stripped = line.strip()

        # Detect markdown table rows (e.g. "| SPY | +0.5% | ...")
        if stripped.startswith('|') and stripped.endswith('|'):
            # Skip separator rows like |---|---|
            if re.match(r'^\|[\s\-:|]+\|$', stripped):
                continue
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            cols = [c.strip() for c in stripped.strip('|').split('|')]
            if not in_table:
                in_table = True
            table_rows.append(cols)
            continue

        # If we were in a table and hit a non-table line, flush it
        if in_table:
            flush_table()

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
            content = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#f9fafb;">\1</strong>', content)
            html_lines.append(f'<li style="color:#d1d5db;margin:2px 0;">{content}</li>')
        elif stripped:
            if in_list:
                html_lines.append('</ul>')
                in_list = False
            processed = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#f9fafb;">\1</strong>', stripped)
            html_lines.append(f'<p style="color:#d1d5db;margin:6px 0;">{processed}</p>')
        else:
            if in_list:
                html_lines.append('</ul>')
                in_list = False

    if in_table:
        flush_table()
    if in_list:
        html_lines.append('</ul>')
    return '\n'.join(html_lines)


def build_breadth_section(realtime_data, daily_data):
    """Build the market breadth HTML section.
    realtime_data structure: {primary: {up4PlusToday, down4PlusToday, ratio5Day, ...}, t2108, ...}
    daily_data structure: {highs: {new52WeekHigh, new52WeekLow}, rsi: {above70, below30}, sma: {aboveSMA200, belowSMA200}, ...}
    """
    if not realtime_data and not daily_data:
        return ''

    rows = ''

    if realtime_data:
        primary = realtime_data.get('primary', {})
        up4 = primary.get('up4PlusToday', 'N/A')
        down4 = primary.get('down4PlusToday', 'N/A')
        ratio = primary.get('ratio5Day', 'N/A')
        t2108 = realtime_data.get('t2108', 'N/A')
        rows += f'''
        <tr><td style="padding:6px 12px;color:#9ca3af;">Up &gt;4%</td>
            <td style="padding:6px 12px;color:#4ade80;text-align:right;">{up4}</td>
            <td style="padding:6px 12px;color:#9ca3af;">Down &gt;4%</td>
            <td style="padding:6px 12px;color:#f87171;text-align:right;">{down4}</td></tr>
        <tr><td style="padding:6px 12px;color:#9ca3af;">Up/Down Ratio (5d)</td>
            <td style="padding:6px 12px;color:{color_for_value(ratio, 1)};text-align:right;">{ratio}</td>
            <td style="padding:6px 12px;color:#9ca3af;">T2108</td>
            <td style="padding:6px 12px;color:#e5e7eb;text-align:right;">{t2108}</td></tr>
        '''

    if daily_data:
        highs = daily_data.get('highs', {})
        rsi = daily_data.get('rsi', {})
        sma = daily_data.get('sma', {})
        nh = highs.get('new52WeekHigh', 'N/A')
        nl = highs.get('new52WeekLow', 'N/A')
        rsi_above = rsi.get('above70', 'N/A')
        rsi_below = rsi.get('below30', 'N/A')
        sma_above = sma.get('aboveSMA200', 'N/A')
        sma_below = sma.get('belowSMA200', 'N/A')
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


def _extract_heatmap_values(data):
    """Extract flat key-value pairs from nested breadth data for heatmap display."""
    flat = {}
    if not data:
        return flat
    # Realtime fields
    primary = data.get('primary', {})
    if primary:
        flat['up4PlusToday'] = primary.get('up4PlusToday')
        flat['down4PlusToday'] = primary.get('down4PlusToday')
        flat['ratio5Day'] = primary.get('ratio5Day')
    if 't2108' in data:
        flat['t2108'] = data.get('t2108')
    # Daily fields
    highs = data.get('highs', {})
    if highs:
        flat['new52WeekHigh'] = highs.get('new52WeekHigh')
        flat['new52WeekLow'] = highs.get('new52WeekLow')
    rsi = data.get('rsi', {})
    if rsi:
        flat['above70'] = rsi.get('above70')
        flat['below30'] = rsi.get('below30')
    return flat


def build_heatmap_section(rt_history, daily_history):
    """Build 5-day breadth heatmap section."""
    if not rt_history and not daily_history:
        return ''

    # Merge data by date, extracting nested fields into flat keys
    date_data = {}
    for entry in (rt_history or []):
        d = entry.get('date', '')
        if d:
            date_data.setdefault(d, {}).update(_extract_heatmap_values(entry.get('data', {})))
    for entry in (daily_history or []):
        d = entry.get('date', '')
        if d:
            date_data.setdefault(d, {}).update(_extract_heatmap_values(entry.get('data', {})))

    if not date_data:
        return ''

    sorted_dates = sorted(date_data.keys(), reverse=True)[:5]

    # Build header row
    date_headers = ''.join(
        f'<th style="padding:6px 8px;color:#9ca3af;text-align:center;font-size:12px;">{d[5:]}</th>'
        for d in sorted_dates
    )

    # Metrics to show: (key_in_flat_data, label, green_is_good)
    metrics = [
        ('up4PlusToday', 'Up >4%', True),
        ('down4PlusToday', 'Down >4%', False),
        ('ratio5Day', 'Up/Down Ratio', True),
        ('new52WeekHigh', '52w Highs', True),
        ('new52WeekLow', '52w Lows', False),
        ('t2108', 'T2108', True),
    ]

    rows = ''
    for key, label, green_is_good in metrics:
        cells = ''
        for d in sorted_dates:
            val = date_data[d].get(key)
            if val is not None and val != '':
                try:
                    v = float(val)
                    if green_is_good:
                        bg = '#064e3b' if v > 0 else '#7f1d1d'
                    else:
                        bg = '#7f1d1d' if v > 0 else '#064e3b'
                    display = str(round(v, 2)) if isinstance(v, float) else str(v)
                except (ValueError, TypeError):
                    bg = '#1f2937'
                    display = str(val)
                cells += f'<td style="padding:6px 8px;text-align:center;background:{bg};color:#e5e7eb;font-size:12px;">{display}</td>'
            else:
                cells += '<td style="padding:6px 8px;text-align:center;background:#1f2937;color:#6b7280;font-size:12px;">-</td>'
        rows += f'''
        <tr style="border-bottom:1px solid #374151;">
          <td style="padding:6px 8px;color:#9ca3af;font-size:12px;white-space:nowrap;">{label}</td>
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


def _get_daytrade_groups_dict(daytrade_data):
    """Extract the groups dict from daytrade data, handling both cache and snapshot formats."""
    if not daytrade_data:
        return {}
    groups_dict = daytrade_data.get('groups', {})
    if not groups_dict or not isinstance(groups_dict, dict):
        return {}
    return groups_dict


def _build_daytrade_groups(daytrade_data):
    """Build day trading groups ranked by avg changePercent (close-to-close).
    daytrade_data.groups is a dict: {ETF_SYMBOL: {name, stocks: [{changePercent, ...}]}}
    """
    groups_dict = _get_daytrade_groups_dict(daytrade_data)
    if not groups_dict:
        return []

    groups = []
    for etf_sym, group_info in groups_dict.items():
        stocks = group_info.get('stocks', [])
        if not stocks:
            continue
        avg_change = sum(s.get('changePercent', 0) for s in stocks) / len(stocks)
        groups.append({
            'name': f"{group_info.get('name', etf_sym)} ({etf_sym})",
            'avgChange': round(avg_change, 2)
        })

    groups.sort(key=lambda g: g['avgChange'], reverse=True)
    return groups


def _calculate_median(values):
    """Calculate median of a list of numbers."""
    if not values:
        return 0
    sorted_vals = sorted(values)
    mid = len(sorted_vals) // 2
    if len(sorted_vals) % 2 == 0:
        return (sorted_vals[mid - 1] + sorted_vals[mid]) / 2
    return sorted_vals[mid]


def _build_swing_groups(daytrade_data):
    """Build swing trading groups ranked by median changeFromOpenPercent (intraday).
    Uses same ETF groups as day trading but different ranking metric.
    """
    groups_dict = _get_daytrade_groups_dict(daytrade_data)
    if not groups_dict:
        return []

    groups = []
    for etf_sym, group_info in groups_dict.items():
        stocks = group_info.get('stocks', [])
        if not stocks:
            continue
        changes = [s.get('changeFromOpenPercent', 0) for s in stocks]
        median_change = _calculate_median(changes)
        groups.append({
            'name': f"{group_info.get('name', etf_sym)} ({etf_sym})",
            'medianChange': round(median_change, 2)
        })

    groups.sort(key=lambda g: g['medianChange'], reverse=True)
    return groups


def build_top_bottom_section(title, groups, key_field, top_n=5, col_label='Avg Change'):
    """Build top/bottom N groups section."""
    if not groups:
        return ''

    top = groups[:top_n]
    bottom = list(reversed(groups[-top_n:])) if len(groups) > top_n else []

    def make_rows(items):
        rows = ''
        for g in items:
            name = g.get('name', '')
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

    top_rows = make_rows(top)
    bottom_rows = make_rows(bottom) if bottom else ''

    bottom_section = ''
    if bottom_rows:
        bottom_section = f'''
        <h3 style="color:#f87171;font-size:14px;margin:16px 0 8px 0;">Bottom {min(top_n, len(bottom))}</h3>
        <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
          <tr style="border-bottom:1px solid #4b5563;">
            <th style="padding:6px 12px;color:#9ca3af;text-align:left;">Group</th>
            <th style="padding:6px 12px;color:#9ca3af;text-align:right;">{col_label}</th>
          </tr>
          {bottom_rows}
        </table>
        '''

    return f'''
    <div style="margin:24px 0;">
      <h2 style="color:#60a5fa;font-size:18px;margin-bottom:12px;">{title}</h2>
      <h3 style="color:#4ade80;font-size:14px;margin:0 0 8px 0;">Top {min(top_n, len(top))}</h3>
      <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;">
        <tr style="border-bottom:1px solid #4b5563;">
          <th style="padding:6px 12px;color:#9ca3af;text-align:left;">Group</th>
          <th style="padding:6px 12px;color:#9ca3af;text-align:right;">{col_label}</th>
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

    # Swing Trading Top/Bottom (ranked by median intraday change)
    swing_groups = _build_swing_groups(daytrade_data)
    swing_section = build_top_bottom_section(
        'Swing Trading — Top/Bottom Groups',
        swing_groups, 'medianChange', 5, 'Median Change'
    )

    # Day Trading Top/Bottom (ranked by avg close-to-close change)
    daytrade_groups = _build_daytrade_groups(daytrade_data)
    daytrade_section = build_top_bottom_section(
        'Day Trading — Top/Bottom Groups',
        daytrade_groups, 'avgChange', 5, 'Avg Change'
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
      {swing_section}
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

        # Gather data (uses last cached/saved data)
        logging.info("Gathering email data...")

        # Market summary (from DB, not cache — persists across days)
        summaries = get_market_summaries(limit=1)
        summary_text = summaries[0]['summary_text'] if summaries else None

        # Breadth data (from cache — may be stale on weekends)
        breadth_rt = get_cached('breadth:realtime')
        breadth_daily = get_cached('breadth:daily')

        # Breadth history (from Redis sorted sets — persists)
        rt_history = get_history('breadth:realtime', 5)
        daily_history = get_history('breadth:daily', 5)

        # Sector rotation
        sector_data = get_cached('sector-rotation:daily')

        # Day trade data (try cache first, fall back to daily snapshot)
        daytrade_data = get_cached('daytrade:realtime')
        if not daytrade_data:
            dt_history = get_history('daytrade:realtime', 1)
            if dt_history:
                daytrade_data = dt_history[0].get('data')
                logging.info("Using daytrade daily snapshot (cache expired)")

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
