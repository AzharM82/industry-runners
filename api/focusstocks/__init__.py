import json
import os
import logging
import sys
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached
from shared.timezone import now_pst

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_FOCUSSTOCKS = 5 * 60  # 5 minutes for focus stocks (increased due to historical data)

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


def get_trading_date_n_days_ago(n_days: int) -> str:
    """Get an approximate trading date n calendar days ago."""
    target_date = now_pst() - timedelta(days=n_days)
    return target_date.strftime('%Y-%m-%d')


def get_grouped_daily_close(date: str) -> dict:
    """
    Get closing prices for all stocks on a specific date using grouped daily endpoint.
    Returns dict of symbol -> close price
    """
    data = polygon_request(f"/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true")

    results = {}
    if '_error' not in data:
        for result in data.get('results', []):
            symbol = result.get('T', '')
            close = result.get('c', 0)
            if symbol and close > 0:
                results[symbol] = close

    return results


def get_historical_closes(days_ago: int) -> dict:
    """
    Get historical closing prices from approximately N days ago.
    Tries multiple dates to handle weekends/holidays.
    """
    # Try a few dates in case of weekends/holidays
    for offset in range(5):
        check_date = get_trading_date_n_days_ago(days_ago + offset)
        prices = get_grouped_daily_close(check_date)
        if prices:
            logging.info(f"Got {len(prices)} prices for {check_date} ({days_ago}+ days ago)")
            return prices

    return {}

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

        # Fetch historical data for 1-week and 1-month changes
        logging.info("Fetching historical data for 1-week and 1-month changes...")
        hist_5d = get_historical_closes(7)   # ~1 week (7 calendar days)
        hist_21d = get_historical_closes(30)  # ~1 month (30 calendar days)

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

                # Calculate 1-week change
                change_1week = None
                price_5d = hist_5d.get(symbol, 0)
                if price_5d > 0:
                    change_1week = round(((current_price - price_5d) / price_5d) * 100, 2)

                # Calculate 1-month change
                change_1month = None
                price_21d = hist_21d.get(symbol, 0)
                if price_21d > 0:
                    change_1month = round(((current_price - price_21d) / price_21d) * 100, 2)

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
                    'change1Week': change_1week,
                    'change1Month': change_1month,
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
