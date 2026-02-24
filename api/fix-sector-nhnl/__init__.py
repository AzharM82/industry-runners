"""
Fix endpoint for sector NH/NL data.
Forces recalculation of 15-day high/low and updates history.
Usage:
  /api/fix-sector-nhnl?date=2026-02-03          — recalculate NH/NL for a specific date
  /api/fix-sector-nhnl?action=cleanup_holidays   — remove holiday/weekend entries from history
"""

import json
import os
import logging
import sys
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached
from shared.timezone import today_pst
from shared.market_calendar import is_market_open as is_trading_day

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

SECTORS = [
    {'name': 'Technology', 'shortName': 'Tech', 'stocks': ['NVDA', 'INTC', 'AAPL', 'AMD', 'AVGO', 'MSFT', 'GOOG', 'MU', 'CSCO', 'MRVL', 'LRCX', 'TSM', 'QCOM', 'TXN', 'AMAT']},
    {'name': 'Financials', 'shortName': 'Financials', 'stocks': ['BAC', 'JPM', 'C', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'USB', 'PNC', 'AXP', 'V', 'MA', 'HOOD', 'SOFI']},
    {'name': 'Health Care', 'shortName': 'Health Care', 'stocks': ['PFE', 'LLY', 'JNJ', 'UNH', 'MRK', 'ABBV', 'AMGN', 'GILD', 'BMY', 'CVS', 'ISRG', 'BSX', 'MDT', 'ZTS', 'VRTX']},
    {'name': 'Discretionary', 'shortName': 'Discretionary', 'stocks': ['TSLA', 'AMZN', 'F', 'HD', 'GM', 'NKE', 'MCD', 'SBUX', 'LOW', 'BKNG', 'TJX', 'ROST', 'DHI', 'LEN', 'MAR']},
    {'name': 'Communication Services', 'shortName': 'Comm Services', 'stocks': ['T', 'CMCSA', 'VZ', 'META', 'NFLX', 'DIS', 'TMUS', 'WBD', 'CHTR', 'EA', 'TTWO', 'SPOT', 'PARA', 'FOX', 'OMC']},
    {'name': 'Industrials', 'shortName': 'Industrials', 'stocks': ['BA', 'CAT', 'HON', 'UNP', 'UPS', 'RTX', 'LMT', 'GE', 'GEV', 'ETN', 'DE', 'FDX', 'NOC', 'WM', 'CSX']},
    {'name': 'Staples', 'shortName': 'Staples', 'stocks': ['WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'CL', 'MDLZ', 'GIS', 'KHC', 'K', 'SYY', 'KR', 'TGT']},
    {'name': 'Energy', 'shortName': 'Energy', 'stocks': ['XOM', 'CVX', 'OXY', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'HAL', 'DVN', 'FANG', 'BKR', 'KMI', 'WMB']},
    {'name': 'Utilities', 'shortName': 'Utilities', 'stocks': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'XEL', 'SRE', 'EXC', 'WEC', 'ED', 'PCG', 'EIX', 'CEG', 'AWK', 'AES']},
    {'name': 'Materials', 'shortName': 'Materials', 'stocks': ['FCX', 'LIN', 'NUE', 'NEM', 'APD', 'SHW', 'DD', 'DOW', 'PPG', 'ECL', 'CTVA', 'CF', 'MOS', 'CLF', 'X']},
    {'name': 'Real Estate', 'shortName': 'Real Estate', 'stocks': ['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'WELL', 'PSA', 'DLR', 'CCI', 'AVB', 'EQR', 'VTR', 'SBAC', 'ARE', 'MAA']}
]


def polygon_request(endpoint: str, timeout: int = 15) -> dict:
    url = f"{POLYGON_BASE_URL}{endpoint}"
    if '?' in url:
        url += f"&apiKey={POLYGON_API_KEY}"
    else:
        url += f"?apiKey={POLYGON_API_KEY}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})
        with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error: {e}")
        return {'_error': str(e)}


def get_all_symbols() -> list:
    symbols = set()
    for sector in SECTORS:
        for stock in sector['stocks']:
            symbols.add(stock)
    return list(symbols)


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        action = req.params.get('action', '')

        # Cleanup holidays/weekends from NH/NL history
        if action == 'cleanup_holidays':
            history_key = "sector-rotation:nh-nl-history"
            history = get_cached(history_key) or {'days': []}
            before_count = len(history['days'])
            removed = []
            kept = []
            for d in history['days']:
                if is_trading_day(d['date']):
                    kept.append(d)
                else:
                    removed.append(d['date'])
            history['days'] = kept

            set_cached(history_key, history, 30 * 24 * 3600)
            return func.HttpResponse(
                json.dumps({
                    'success': True,
                    'action': 'cleanup_holidays',
                    'before_count': before_count,
                    'after_count': len(history['days']),
                    'removed_dates': removed
                }, indent=2),
                mimetype="application/json"
            )

        target_date = req.params.get('date', today_pst())

        # Warn if target date is not a trading day
        if not is_trading_day(target_date):
            return func.HttpResponse(
                json.dumps({
                    'error': f'{target_date} is not a trading day (weekend or holiday)',
                    'hint': 'Use a valid market day or ?action=cleanup_holidays to remove bad entries'
                }, indent=2),
                status_code=400,
                mimetype="application/json"
            )

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        all_symbols = get_all_symbols()
        debug_info = []
        debug_info.append(f"Target date: {target_date}")
        debug_info.append(f"Total symbols: {len(all_symbols)}")

        # Clear the 15-day cache to force fresh fetch
        set_cached("sector-rotation:15day-highlow", None, 0)
        debug_info.append("Cleared 15-day high/low cache")

        # Calculate date range for 15-day lookback (excluding target date)
        target_dt = datetime.strptime(target_date, '%Y-%m-%d')
        from_date = (target_dt - timedelta(days=30)).strftime('%Y-%m-%d')
        to_date = (target_dt - timedelta(days=1)).strftime('%Y-%m-%d')

        debug_info.append(f"15-day range: {from_date} to {to_date}")

        # Fetch 15-day high/low for all symbols
        high_low_15d = {}
        for symbol in all_symbols[:5]:  # Sample first 5 for debug
            data = polygon_request(
                f"/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}?adjusted=true&sort=desc&limit=15",
                timeout=10
            )
            if '_error' not in data and data.get('results'):
                bars = data['results'][:15]
                if bars:
                    highs = [bar.get('h', 0) for bar in bars if bar.get('h')]
                    lows = [bar.get('l', 0) for bar in bars if bar.get('l')]
                    high_low_15d[symbol] = {
                        'high15d': max(highs) if highs else 0,
                        'low15d': min(lows) if lows else 0,
                        'bars_count': len(bars)
                    }
                    debug_info.append(f"{symbol}: high15d={high_low_15d[symbol]['high15d']:.2f}, low15d={high_low_15d[symbol]['low15d']:.2f}, bars={len(bars)}")

        # Get today's data for the target date
        today_data = polygon_request(f"/v2/aggs/grouped/locale/us/market/stocks/{target_date}?adjusted=true")

        if '_error' in today_data:
            debug_info.append(f"Error fetching today's data: {today_data['_error']}")
        else:
            results_count = len(today_data.get('results', []))
            debug_info.append(f"Today's grouped data: {results_count} results")

        # Build sector NH/NL
        sectors_result = []

        # Fetch all 15-day data
        for symbol in all_symbols:
            data = polygon_request(
                f"/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}?adjusted=true&sort=desc&limit=15",
                timeout=10
            )
            if '_error' not in data and data.get('results'):
                bars = data['results'][:15]
                if bars:
                    highs = [bar.get('h', 0) for bar in bars if bar.get('h')]
                    lows = [bar.get('l', 0) for bar in bars if bar.get('l')]
                    high_low_15d[symbol] = {
                        'high15d': max(highs) if highs else 0,
                        'low15d': min(lows) if lows else 0
                    }

        # Get today's prices from grouped data
        today_prices = {}
        if '_error' not in today_data:
            for r in today_data.get('results', []):
                symbol = r.get('T', '')
                if symbol:
                    today_prices[symbol] = {
                        'high': r.get('h', 0),
                        'low': r.get('l', 0),
                        'close': r.get('c', 0)
                    }

        # Calculate NH/NL for each sector
        for sector in SECTORS:
            new_highs = 0
            new_lows = 0

            for symbol in sector['stocks']:
                s15d = high_low_15d.get(symbol, {})
                today = today_prices.get(symbol, {})

                high_15d = s15d.get('high15d', 0)
                low_15d = s15d.get('low15d', 0)
                day_high = today.get('high', 0)
                day_low = today.get('low', 0)

                if day_high > 0 and high_15d > 0 and day_high > high_15d:
                    new_highs += 1
                if day_low > 0 and low_15d > 0 and day_low < low_15d:
                    new_lows += 1

            sectors_result.append({
                'name': sector['shortName'],
                'nh': new_highs,
                'nl': new_lows
            })

        debug_info.append("--- Sector Results ---")
        for s in sectors_result:
            debug_info.append(f"{s['name']}: NH={s['nh']}, NL={s['nl']}")

        # Update NH/NL history
        history_key = "sector-rotation:nh-nl-history"
        history = get_cached(history_key) or {'days': []}

        day_data = {
            'date': target_date,
            'sectors': {s['name']: {'nh': s['nh'], 'nl': s['nl']} for s in sectors_result}
        }

        # Update or append
        existing_idx = next((i for i, d in enumerate(history['days']) if d['date'] == target_date), None)
        if existing_idx is not None:
            history['days'][existing_idx] = day_data
            debug_info.append(f"Updated existing entry for {target_date}")
        else:
            history['days'].append(day_data)
            debug_info.append(f"Added new entry for {target_date}")

        # Sort and keep last 20
        history['days'] = sorted(history['days'], key=lambda x: x['date'], reverse=True)[:20]
        set_cached(history_key, history, 30 * 24 * 3600)
        debug_info.append("Saved updated history to cache")

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'date': target_date,
                'sectors': sectors_result,
                'debug': debug_info
            }, indent=2),
            mimetype="application/json"
        )

    except Exception as e:
        import traceback
        return func.HttpResponse(
            json.dumps({
                'error': str(e),
                'traceback': traceback.format_exc()
            }, indent=2),
            status_code=500,
            mimetype="application/json"
        )
