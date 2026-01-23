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
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {}

def main(req: func.HttpRequest) -> func.HttpResponse:
    """Get detailed stock data for a single symbol including 52-week data."""
    try:
        symbol = req.params.get('symbol', '').strip().upper()

        if not symbol:
            return func.HttpResponse(
                json.dumps({'error': 'No symbol provided'}),
                status_code=400,
                mimetype="application/json"
            )

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        # Get current snapshot
        snapshot_data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
        ticker = snapshot_data.get('ticker', {})

        if not ticker:
            return func.HttpResponse(
                json.dumps({'error': f'No data for {symbol}'}),
                status_code=404,
                mimetype="application/json"
            )

        day = ticker.get('day', {})
        prev_day = ticker.get('prevDay', {})
        last_trade = ticker.get('lastTrade', {})
        min_data = ticker.get('min', {})

        current_price = last_trade.get('p') or day.get('c') or min_data.get('c') or 0
        open_price = day.get('o', 0)
        prev_close = prev_day.get('c', 0)

        change_from_open = current_price - open_price if open_price > 0 else 0
        change_from_open_pct = (change_from_open / open_price * 100) if open_price > 0 else 0

        # Get 52-week high/low using aggregates endpoint
        week52_high = 0
        week52_low = 0
        avg_volume = 0

        try:
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')

            agg_data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?limit=365")
            results = agg_data.get('results', [])

            if results:
                highs = [r.get('h', 0) for r in results if r.get('h')]
                lows = [r.get('l', 0) for r in results if r.get('l')]
                volumes = [r.get('v', 0) for r in results if r.get('v')]

                week52_high = max(highs) if highs else 0
                week52_low = min(lows) if lows else 0

                # Average volume over last 30 days
                recent_volumes = volumes[-30:] if len(volumes) >= 30 else volumes
                avg_volume = int(sum(recent_volumes) / len(recent_volumes)) if recent_volumes else 0
        except Exception as e:
            logging.error(f"Error getting historical data for {symbol}: {e}")

        # Get company details for market cap
        market_cap = None
        try:
            details_data = polygon_request(f"/v3/reference/tickers/{symbol}")
            details_results = details_data.get('results', {})
            market_cap = details_results.get('market_cap')
        except Exception as e:
            logging.error(f"Error getting company details for {symbol}: {e}")

        result = {
            'symbol': symbol,
            'name': symbol,
            'last': current_price,
            'change': ticker.get('todaysChange', 0),
            'changePercent': ticker.get('todaysChangePerc', 0),
            'changeFromOpen': round(change_from_open, 2),
            'changeFromOpenPercent': round(change_from_open_pct, 2),
            'open': open_price,
            'previousClose': prev_close,
            'high': day.get('h', 0),
            'low': day.get('l', 0),
            'volume': day.get('v', 0),
            'marketCap': market_cap,
            'week52High': week52_high,
            'week52Low': week52_low,
            'avgVolume': avg_volume,
            'timestamp': ticker.get('updated', 0)
        }

        return func.HttpResponse(
            json.dumps(result),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in details endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
