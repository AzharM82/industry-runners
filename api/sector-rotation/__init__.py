import json
import os
import logging
import sys
from datetime import datetime
import azure.functions as func
import urllib.request

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_SECTOR = 60  # 1 minute cache for real-time feel

# Sector data - 11 sectors with 15 stocks each
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
        with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {'_error': str(e)}


def get_all_symbols() -> list:
    """Get all unique symbols from all sectors"""
    symbols = set()
    for sector in SECTORS:
        for stock in sector['stocks']:
            symbols.add(stock)
    return list(symbols)


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        refresh = req.params.get('refresh', '').lower() == 'true'

        # Cache key
        cache_key = "sector-rotation:daily"

        # Check cache first
        if not refresh:
            cached_data = get_cached(cache_key)
            if cached_data:
                logging.info("Cache hit for sector-rotation")
                cached_data['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached_data),
                    mimetype="application/json"
                )

        logging.info("Fetching sector rotation data...")

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        all_symbols = get_all_symbols()

        # Fetch snapshot data in batches - only ~4 API calls needed
        all_quotes = {}
        batch_size = 50

        for i in range(0, len(all_symbols), batch_size):
            batch = all_symbols[i:i + batch_size]
            data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(batch)}")

            if '_error' not in data:
                for ticker_data in data.get('tickers', []):
                    symbol = ticker_data.get('ticker', '')
                    day = ticker_data.get('day', {})
                    prev_day = ticker_data.get('prevDay', {})
                    last_trade = ticker_data.get('lastTrade', {})

                    current_price = last_trade.get('p') or day.get('c') or 0
                    prev_close = prev_day.get('c', 0)

                    # Calculate daily change percent
                    change_pct = 0
                    if prev_close > 0:
                        change_pct = ((current_price - prev_close) / prev_close) * 100

                    all_quotes[symbol] = {
                        'price': current_price,
                        'changePercent': ticker_data.get('todaysChangePerc', change_pct),
                        'volume': day.get('v', 0)
                    }

        # Build sector data
        sectors_data = []

        for sector in SECTORS:
            stocks = []
            total_change = 0
            valid_count = 0

            for symbol in sector['stocks']:
                quote = all_quotes.get(symbol, {})

                if not quote.get('price'):
                    continue

                change_pct = quote.get('changePercent', 0)

                stocks.append({
                    'symbol': symbol,
                    'changePercent': round(change_pct, 2),
                    'price': round(quote['price'], 2),
                    'volume': quote.get('volume', 0)
                })

                total_change += change_pct
                valid_count += 1

            avg_change = total_change / valid_count if valid_count > 0 else 0

            sectors_data.append({
                'name': sector['name'],
                'shortName': sector['shortName'],
                'avgChange': round(avg_change, 2),
                'stocks': stocks
            })

        response_data = {
            'timestamp': int(datetime.now().timestamp() * 1000),
            'sectors': sectors_data,
            'cached': False
        }

        # Cache the result
        set_cached(cache_key, response_data, CACHE_TTL_SECTOR)
        logging.info("Cached sector rotation data")

        return func.HttpResponse(
            json.dumps(response_data),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in sector-rotation endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
