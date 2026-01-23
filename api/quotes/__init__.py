import json
import os
import logging
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request

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
        import ssl
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})
        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {'_error': str(e)}

def get_5day_close(symbol: str) -> float:
    """Get the closing price from 5 trading days ago."""
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')

        data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=desc&limit=10")
        results = data.get('results', [])
        if len(results) >= 6:
            return results[5].get('c', 0)
    except Exception as e:
        logging.error(f"Error getting 5-day close for {symbol}: {e}")
    return 0

def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        symbols_param = req.params.get('symbols', '')
        if not symbols_param:
            try:
                body = req.get_json()
                symbols_param = body.get('symbols', '')
            except:
                pass

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

        # Use Polygon's snapshot endpoint
        data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(symbols)}")

        quotes = {}
        errors = []

        # Check for request errors
        if '_error' in data:
            errors.append(f"Polygon API error: {data['_error']}")

        # Only fetch 5-day data for market indices
        MARKET_INDICES = ['SPY', 'QQQ', 'DIA', 'IWM', 'IJR']
        five_day_prices = {}
        for symbol in MARKET_INDICES:
            if symbol in symbols:
                price = get_5day_close(symbol)
                if price > 0:
                    five_day_prices[symbol] = price

        for ticker_data in data.get('tickers', []):
            try:
                symbol = ticker_data.get('ticker', '')
                day = ticker_data.get('day', {})
                prev_day = ticker_data.get('prevDay', {})
                last_trade = ticker_data.get('lastTrade', {})
                min_data = ticker_data.get('min', {})

                current_price = (
                    last_trade.get('p') or
                    day.get('c') or
                    min_data.get('c') or
                    0
                )

                open_price = day.get('o', 0)
                prev_close = prev_day.get('c', 0)

                change_from_open = current_price - open_price if open_price > 0 else 0
                change_from_open_pct = (change_from_open / open_price * 100) if open_price > 0 else 0

                five_day_close = five_day_prices.get(symbol, 0)
                change_5day = None
                if five_day_close > 0 and current_price > 0:
                    change_5day = ((current_price - five_day_close) / five_day_close) * 100

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
                    'marketCap': None,
                    'week52High': 0,
                    'week52Low': 0,
                    'avgVolume': 0,
                    'change5Day': round(change_5day, 2) if change_5day is not None else None,
                    'timestamp': ticker_data.get('updated', 0)
                }
            except Exception as e:
                errors.append(f'{symbol}: {str(e)}')

        return func.HttpResponse(
            json.dumps({
                'quotes': quotes,
                'errors': errors if errors else None,
                'count': len(quotes)
            }),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in quotes endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
