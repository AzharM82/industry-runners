"""
Fix endpoint for breadth history.
Can force-refresh today's snapshot or delete a bad entry.
Usage:
  /api/fix-breadth?action=refresh - Force refresh today's data from Finviz
  /api/fix-breadth?action=delete&date=2026-02-03 - Delete a bad snapshot
"""

import json
import os
import sys
import logging
import re
import time
import urllib.request
import ssl
import azure.functions as func

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_redis_client, set_cached, save_daily_snapshot, CACHE_TTL_DAILY
from shared.timezone import now_pst, today_pst


# Import Finviz fetching from breadth-daily
FINVIZ_FILTERS = {
    'new52WeekHigh': 'ta_highlow52w_nh',
    'new52WeekLow': 'ta_highlow52w_nl',
    'rsiAbove70': 'ta_rsi_ob70',
    'rsiBelow30': 'ta_rsi_os30',
    'aboveSMA20': 'ta_sma20_pa',
    'belowSMA20': 'ta_sma20_pb',
    'aboveSMA50': 'ta_sma50_pa',
    'belowSMA50': 'ta_sma50_pb',
    'aboveSMA200': 'ta_sma200_pa',
    'belowSMA200': 'ta_sma200_pb',
    'sma50AboveSMA200': 'ta_sma50_cross200a',
    'sma50BelowSMA200': 'ta_sma50_cross200b',
}
BASE_FILTER = 'exch_nasd,nyse,amex'


def fetch_finviz_count(filter_code: str) -> tuple:
    """Fetch count with debug info."""
    url = f"https://finviz.com/screener.ashx?v=111&f={BASE_FILTER},{filter_code}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            html = response.read().decode('utf-8')

            # Try all patterns
            patterns = [
                (r'screener-total[^>]*>[^#]*#\d+\s*/\s*(\d+)\s*Total', 'screener-total'),
                (r'#\d+\s*/\s*(\d+)\s*Total', 'hash-total'),
                (r'Total[^<]*</td>[^<]*<td[^>]*><b>(\d+)</b>', 'table-total'),
                (r'#\d+\s*/\s*(\d+)', 'hash-only'),
            ]

            for pattern, name in patterns:
                match = re.search(pattern, html)
                if match:
                    return int(match.group(1)), name

            if 'No results' in html or 'found 0' in html.lower():
                return 0, 'no-results'

            # Return snippet for debugging
            return 0, f'no-match (html length: {len(html)})'

    except Exception as e:
        return 0, f'error: {str(e)}'


def fetch_total_universe() -> tuple:
    """Fetch total count with debug info."""
    url = f"https://finviz.com/screener.ashx?v=111&f={BASE_FILTER}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            html = response.read().decode('utf-8')

            patterns = [
                (r'screener-total[^>]*>[^#]*#\d+\s*/\s*(\d+)\s*Total', 'screener-total'),
                (r'#\d+\s*/\s*(\d+)\s*Total', 'hash-total'),
                (r'#\d+\s*/\s*(\d+)', 'hash-only'),
            ]

            for pattern, name in patterns:
                match = re.search(pattern, html)
                if match:
                    return int(match.group(1)), name

            return 0, f'no-match (html length: {len(html)})'

    except Exception as e:
        return 0, f'error: {str(e)}'


def main(req: func.HttpRequest) -> func.HttpResponse:
    action = req.params.get('action', '')

    if action == 'delete':
        date = req.params.get('date', '')
        if not date:
            return func.HttpResponse(
                json.dumps({'error': 'date parameter required'}),
                status_code=400,
                mimetype="application/json"
            )

        client = get_redis_client()
        if not client:
            return func.HttpResponse(
                json.dumps({'error': 'Redis not connected'}),
                status_code=500,
                mimetype="application/json"
            )

        key = f'breadth:daily:history:{date}'
        dates_key = 'breadth:daily:history:dates'

        deleted_key = client.delete(key)
        deleted_date = client.zrem(dates_key, date)

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'action': 'delete',
                'date': date,
                'deleted_key': bool(deleted_key),
                'deleted_from_set': bool(deleted_date)
            }),
            mimetype="application/json"
        )

    elif action == 'refresh':
        # Force refresh from Finviz with detailed debug output
        debug_info = []
        results = {}

        universe, universe_method = fetch_total_universe()
        debug_info.append(f'universe: {universe} (method: {universe_method})')

        for i, (name, filter_code) in enumerate(FINVIZ_FILTERS.items()):
            if i > 0:
                time.sleep(0.5)
            count, method = fetch_finviz_count(filter_code)
            results[name] = count
            debug_info.append(f'{name}: {count} (method: {method})')

        # Calculate ratios
        high_low_ratio = None
        if results['new52WeekLow'] > 0:
            high_low_ratio = round(results['new52WeekHigh'] / results['new52WeekLow'], 2)
        elif results['new52WeekHigh'] > 0:
            high_low_ratio = 99.99

        rsi_ratio = None
        if results['rsiBelow30'] > 0:
            rsi_ratio = round(results['rsiAbove70'] / results['rsiBelow30'], 2)
        elif results['rsiAbove70'] > 0:
            rsi_ratio = 99.99

        # Build response
        response = {
            'date': today_pst(),
            'timestamp': int(now_pst().timestamp() * 1000),
            'universeCount': universe,
            'cached': False,
            'highs': {
                'new52WeekHigh': results['new52WeekHigh'],
                'new52WeekLow': results['new52WeekLow'],
                'highLowRatio': high_low_ratio
            },
            'rsi': {
                'above70': results['rsiAbove70'],
                'below30': results['rsiBelow30'],
                'rsiRatio': rsi_ratio
            },
            'sma': {
                'aboveSMA20': results['aboveSMA20'],
                'belowSMA20': results['belowSMA20'],
                'aboveSMA50': results['aboveSMA50'],
                'belowSMA50': results['belowSMA50'],
                'aboveSMA200': results['aboveSMA200'],
                'belowSMA200': results['belowSMA200']
            },
            'trend': {
                'goldenCross': results['sma50AboveSMA200'],
                'deathCross': results['sma50BelowSMA200']
            }
        }

        # Force save to cache and snapshot
        set_cached('breadth:daily', response, CACHE_TTL_DAILY)
        save_daily_snapshot('breadth:daily', response)

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'action': 'refresh',
                'date': today_pst(),
                'debug_info': debug_info,
                'data': response
            }, indent=2),
            mimetype="application/json"
        )

    else:
        return func.HttpResponse(
            json.dumps({
                'usage': {
                    'refresh': '/api/fix-breadth?action=refresh',
                    'delete': '/api/fix-breadth?action=delete&date=YYYY-MM-DD'
                }
            }),
            mimetype="application/json"
        )
