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
from shared.cache import get_cached, set_cached

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_FOCUSSTOCKS = 2 * 60  # 2 minutes for real-time focus stocks

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

def main(req: func.HttpRequest) -> func.HttpResponse:
    """Get focus stocks data with relative volume for bubble chart."""
    try:
        symbols_param = req.params.get('symbols', '')
        if not symbols_param:
            return func.HttpResponse(
                json.dumps({'error': 'No symbols provided'}),
                status_code=400,
                mimetype="application/json"
            )

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]

        # Check for refresh parameter
        refresh = req.params.get('refresh', '').lower() == 'true'

        # Create cache key based on sorted symbols
        cache_key = f"focusstocks:{hash(frozenset(symbols))}"

        # Check cache first (unless refresh requested)
        if not refresh:
            cached_data = get_cached(cache_key)
            if cached_data:
                logging.info(f"Cache hit for focusstocks")
                cached_data['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached_data),
                    mimetype="application/json"
                )

        logging.info(f"Cache miss for focusstocks, fetching {len(symbols)} symbols...")

        # Fetch snapshot data for all symbols (single API call)
        snapshot_data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(symbols)}")

        if '_error' in snapshot_data:
            return func.HttpResponse(
                json.dumps({'error': f"Polygon API error: {snapshot_data['_error']}"}),
                status_code=500,
                mimetype="application/json"
            )

        # Build stocks list from snapshot
        stocks = []
        for ticker_data in snapshot_data.get('tickers', []):
            try:
                symbol = ticker_data.get('ticker', '')
                day = ticker_data.get('day', {})
                prev_day = ticker_data.get('prevDay', {})
                last_trade = ticker_data.get('lastTrade', {})
                min_data = ticker_data.get('min', {})

                current_price = last_trade.get('p') or day.get('c') or min_data.get('c') or 0
                open_price = day.get('o', 0)
                current_volume = day.get('v', 0)
                prev_volume = prev_day.get('v', 0)

                # Skip stocks with no price data
                if current_price <= 0:
                    continue

                change_from_open = current_price - open_price if open_price > 0 else 0
                change_from_open_pct = (change_from_open / open_price * 100) if open_price > 0 else 0

                # Calculate relative volume using previous day's volume as baseline
                # This is a fast approximation - for more accuracy, would need historical data
                relative_volume = 0
                if prev_volume > 0 and current_volume > 0:
                    relative_volume = round(current_volume / prev_volume, 2)

                stocks.append({
                    'symbol': symbol,
                    'last': round(current_price, 2),
                    'open': round(open_price, 2),
                    'high': round(day.get('h', 0), 2),
                    'low': round(day.get('l', 0), 2),
                    'volume': current_volume,
                    'avgVolume': prev_volume,  # Using prev day volume as proxy
                    'relativeVolume': relative_volume,
                    'changeFromOpen': round(change_from_open, 2),
                    'changeFromOpenPercent': round(change_from_open_pct, 2),
                    'change': round(ticker_data.get('todaysChange', 0), 2),
                    'changePercent': round(ticker_data.get('todaysChangePerc', 0), 2),
                    'previousClose': round(prev_day.get('c', 0), 2),
                })
            except Exception as e:
                logging.error(f"Error processing {ticker_data.get('ticker', 'unknown')}: {e}")
                continue

        response_data = {
            'stocks': stocks,
            'count': len(stocks),
            'timestamp': datetime.now().isoformat(),
            'cached': False
        }

        # Cache the result
        set_cached(cache_key, response_data, CACHE_TTL_FOCUSSTOCKS)
        logging.info(f"Cached focusstocks data for {len(symbols)} symbols")

        return func.HttpResponse(
            json.dumps(response_data),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in focusstocks endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
