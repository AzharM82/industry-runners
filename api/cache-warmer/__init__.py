import json
import os
import logging
import sys
from datetime import datetime
import azure.functions as func
import urllib.request
import ssl

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import set_cached, CACHE_TTL_REALTIME

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

# Market indices to warm cache for
MARKET_INDICES = ['SPY', 'QQQ', 'DIA', 'IWM', 'IJR']

def polygon_request(endpoint: str) -> dict:
    """Make a request to Polygon API"""
    url = f"{POLYGON_BASE_URL}{endpoint}"
    if '?' in url:
        url += f"&apiKey={POLYGON_API_KEY}"
    else:
        url += f"?apiKey={POLYGON_API_KEY}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'SmartStockAnalysis/1.0'})
        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {'_error': str(e)}

def warm_quotes_cache():
    """Pre-warm the quotes cache for market indices."""
    try:
        symbols = MARKET_INDICES
        data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(symbols)}")

        if '_error' in data:
            logging.error(f"Failed to warm quotes cache: {data['_error']}")
            return False

        quotes = {}
        for ticker_data in data.get('tickers', []):
            symbol = ticker_data.get('ticker', '')
            day = ticker_data.get('day', {})
            prev_day = ticker_data.get('prevDay', {})
            last_trade = ticker_data.get('lastTrade', {})
            min_data = ticker_data.get('min', {})

            current_price = last_trade.get('p') or day.get('c') or min_data.get('c') or 0
            open_price = day.get('o', 0)
            prev_close = prev_day.get('c', 0)

            change_from_open = current_price - open_price if open_price > 0 else 0
            change_from_open_pct = (change_from_open / open_price * 100) if open_price > 0 else 0

            quotes[symbol] = {
                'symbol': symbol,
                'name': symbol,
                'last': current_price,
                'change': ticker_data.get('todaysChange', 0),
                'changePercent': ticker_data.get('todaysChangePerc', 0),
                'changeFromOpen': round(change_from_open, 2),
                'changeFromOpenPercent': round(change_from_open_pct, 2),
                'open': open_price,
                'previousClose': prev_close,
                'high': day.get('h', 0),
                'low': day.get('l', 0),
                'volume': day.get('v', 0),
            }

        response_data = {
            'quotes': quotes,
            'count': len(quotes),
            'timestamp': datetime.now().isoformat(),
            'cached': False
        }

        cache_key = f"quotes:{hash(frozenset(symbols))}"
        set_cached(cache_key, response_data, 30)  # 30 second TTL for quotes
        logging.info(f"Warmed quotes cache for {len(quotes)} market indices")
        return True

    except Exception as e:
        logging.error(f"Error warming quotes cache: {e}")
        return False

def main(timer: func.TimerRequest) -> None:
    """Timer-triggered function to warm caches at market open."""
    utc_timestamp = datetime.utcnow().isoformat()

    if timer.past_due:
        logging.info('Cache warmer is running late!')

    logging.info(f'Cache warmer started at {utc_timestamp}')

    if not POLYGON_API_KEY:
        logging.error('Polygon API key not configured, skipping cache warm')
        return

    # Warm quotes cache for market indices
    warm_quotes_cache()

    logging.info(f'Cache warming completed at {datetime.utcnow().isoformat()}')
