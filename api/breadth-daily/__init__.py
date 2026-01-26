import json
import os
import sys
import logging
import re
from datetime import datetime
import azure.functions as func
import urllib.request
import ssl

# Add shared module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached, save_daily_snapshot, should_save_daily_snapshot, CACHE_TTL_DAILY

CACHE_KEY = 'breadth:daily'

# Finviz screener filters
# Documentation: https://finviz.com/screener.ashx
FINVIZ_FILTERS = {
    # 52-week highs/lows
    'new52WeekHigh': 'ta_highlow52w_nh',
    'new52WeekLow': 'ta_highlow52w_nl',

    # RSI conditions (ob = overbought >70, os = oversold <30)
    'rsiAbove70': 'ta_rsi_ob70',
    'rsiBelow30': 'ta_rsi_os30',

    # SMA conditions (pa = price above, pb = price below)
    'aboveSMA20': 'ta_sma20_pa',
    'belowSMA20': 'ta_sma20_pb',
    'aboveSMA50': 'ta_sma50_pa',
    'belowSMA50': 'ta_sma50_pb',
    'aboveSMA200': 'ta_sma200_pa',
    'belowSMA200': 'ta_sma200_pb',

    # SMA crossovers (Golden Cross = SMA50 crossed above SMA200)
    'sma50AboveSMA200': 'ta_sma50_cross200a',
    'sma50BelowSMA200': 'ta_sma50_cross200b',
}

# Base filter for US stocks only (exclude OTC, etc.)
BASE_FILTER = 'exch_nasd,nyse,amex'


def fetch_finviz_count(filter_code: str) -> int:
    """
    Fetch count of stocks matching a Finviz filter.
    Returns the total count from the screener page.
    """
    url = f"https://finviz.com/screener.ashx?v=111&f={BASE_FILTER},{filter_code}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            html = response.read().decode('utf-8')

            # Pattern 1: New Finviz format - screener-total div with "#1 / 2580 Total"
            match = re.search(r'screener-total[^>]*>[^#]*#\d+\s*/\s*(\d+)\s*Total', html)
            if match:
                return int(match.group(1))

            # Pattern 2: Alternative "#1 / 123" format anywhere in the page
            match = re.search(r'#\d+\s*/\s*(\d+)\s*Total', html)
            if match:
                return int(match.group(1))

            # Pattern 3: Old format - "Total: X" in table
            match = re.search(r'Total[^<]*</td>[^<]*<td[^>]*><b>(\d+)</b>', html)
            if match:
                return int(match.group(1))

            # Pattern 4: Just "#1 / 123" without "Total"
            match = re.search(r'#\d+\s*/\s*(\d+)', html)
            if match:
                return int(match.group(1))

            # If no stocks match, page shows different content
            if 'No results' in html or 'found 0' in html.lower() or 'no matches' in html.lower():
                return 0

            logging.warning(f"Could not parse count from Finviz for filter {filter_code}")
            return 0

    except Exception as e:
        logging.error(f"Error fetching Finviz data for {filter_code}: {e}")
        return 0


def fetch_total_universe_count() -> int:
    """Fetch total count of US stocks on Finviz."""
    url = f"https://finviz.com/screener.ashx?v=111&f={BASE_FILTER}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            html = response.read().decode('utf-8')

            # Pattern 1: New Finviz format - screener-total div
            match = re.search(r'screener-total[^>]*>[^#]*#\d+\s*/\s*(\d+)\s*Total', html)
            if match:
                return int(match.group(1))

            # Pattern 2: "#1 / 123 Total" format
            match = re.search(r'#\d+\s*/\s*(\d+)\s*Total', html)
            if match:
                return int(match.group(1))

            # Pattern 3: Old table format
            match = re.search(r'Total[^<]*</td>[^<]*<td[^>]*><b>(\d+)</b>', html)
            if match:
                return int(match.group(1))

            # Pattern 4: Just "#1 / 123"
            match = re.search(r'#\d+\s*/\s*(\d+)', html)
            if match:
                return int(match.group(1))

            return 0

    except Exception as e:
        logging.error(f"Error fetching Finviz universe count: {e}")
        return 0


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Check for bypass cache parameter
        bypass_cache = req.params.get('refresh', '').lower() == 'true'

        # Try to get cached data first (unless bypassing)
        if not bypass_cache:
            cached = get_cached(CACHE_KEY)
            if cached:
                logging.info("Returning cached Finviz breadth data")
                cached['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached),
                    mimetype="application/json"
                )

        logging.info("Fetching Finviz breadth data...")

        # Get total universe count
        universe_count = fetch_total_universe_count()
        logging.info(f"Universe count: {universe_count}")

        # Fetch counts for each filter
        results = {}
        for name, filter_code in FINVIZ_FILTERS.items():
            count = fetch_finviz_count(filter_code)
            results[name] = count
            logging.info(f"{name}: {count}")

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
            'date': datetime.now().strftime('%Y-%m-%d'),
            'timestamp': int(datetime.now().timestamp() * 1000),
            'universeCount': universe_count,
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

        # Cache the response (1 hour TTL for daily data)
        set_cached(CACHE_KEY, response, CACHE_TTL_DAILY)
        logging.info("Cached Finviz breadth data")

        # Save daily snapshot (once per day)
        if should_save_daily_snapshot('breadth:daily'):
            save_daily_snapshot('breadth:daily', response)

        return func.HttpResponse(
            json.dumps(response),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in breadth-daily endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
