import json
import os
import logging
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

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

def get_avg_volume(symbol: str) -> int:
    """Get 30-day average volume for a symbol."""
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d')

        data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?limit=45")
        results = data.get('results', [])

        if results:
            volumes = [r.get('v', 0) for r in results if r.get('v')]
            recent_volumes = volumes[-30:] if len(volumes) >= 30 else volumes
            if recent_volumes:
                return int(sum(recent_volumes) / len(recent_volumes))
    except Exception as e:
        logging.error(f"Error getting avg volume for {symbol}: {e}")

    return 0

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

        # Fetch snapshot data for all symbols
        snapshot_data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(symbols)}")

        if '_error' in snapshot_data:
            return func.HttpResponse(
                json.dumps({'error': f"Polygon API error: {snapshot_data['_error']}"}),
                status_code=500,
                mimetype="application/json"
            )

        # Build quotes dict from snapshot
        snapshot_quotes = {}
        for ticker_data in snapshot_data.get('tickers', []):
            symbol = ticker_data.get('ticker', '')
            day = ticker_data.get('day', {})
            prev_day = ticker_data.get('prevDay', {})
            last_trade = ticker_data.get('lastTrade', {})
            min_data = ticker_data.get('min', {})

            current_price = last_trade.get('p') or day.get('c') or min_data.get('c') or 0
            open_price = day.get('o', 0)
            volume = day.get('v', 0)

            change_from_open = current_price - open_price if open_price > 0 else 0
            change_from_open_pct = (change_from_open / open_price * 100) if open_price > 0 else 0

            snapshot_quotes[symbol] = {
                'symbol': symbol,
                'last': current_price,
                'open': open_price,
                'high': day.get('h', 0),
                'low': day.get('l', 0),
                'volume': volume,
                'changeFromOpen': round(change_from_open, 2),
                'changeFromOpenPercent': round(change_from_open_pct, 2),
                'change': ticker_data.get('todaysChange', 0),
                'changePercent': ticker_data.get('todaysChangePerc', 0),
                'previousClose': prev_day.get('c', 0),
            }

        # Fetch average volumes in parallel for relative volume calculation
        avg_volumes = {}
        symbols_to_fetch = list(snapshot_quotes.keys())

        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_symbol = {executor.submit(get_avg_volume, symbol): symbol for symbol in symbols_to_fetch}
            for future in as_completed(future_to_symbol):
                symbol = future_to_symbol[future]
                try:
                    avg_volumes[symbol] = future.result()
                except Exception as e:
                    logging.error(f"Error fetching avg volume for {symbol}: {e}")
                    avg_volumes[symbol] = 0

        # Calculate relative volume and build final response
        stocks = []
        for symbol, quote in snapshot_quotes.items():
            avg_vol = avg_volumes.get(symbol, 0)
            current_vol = quote.get('volume', 0)

            # Calculate relative volume (current volume / average volume)
            relative_volume = 0
            if avg_vol > 0 and current_vol > 0:
                relative_volume = round(current_vol / avg_vol, 2)

            stocks.append({
                'symbol': symbol,
                'last': quote['last'],
                'open': quote['open'],
                'high': quote['high'],
                'low': quote['low'],
                'volume': current_vol,
                'avgVolume': avg_vol,
                'relativeVolume': relative_volume,
                'changeFromOpen': quote['changeFromOpen'],
                'changeFromOpenPercent': quote['changeFromOpenPercent'],
                'change': quote['change'],
                'changePercent': quote['changePercent'],
                'previousClose': quote['previousClose'],
            })

        return func.HttpResponse(
            json.dumps({
                'stocks': stocks,
                'count': len(stocks)
            }),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in focusstocks endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
