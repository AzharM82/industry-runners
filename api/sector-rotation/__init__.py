import json
import os
import logging
import sys
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_MARKET_OPEN = 60  # 1 minute during market hours
CACHE_TTL_MARKET_CLOSED = 3600  # 1 hour when market closed

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


def is_market_open() -> bool:
    """Check if US stock market is currently open (9:30 AM - 4:00 PM ET, Mon-Fri)"""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    et_tz = ZoneInfo('America/New_York')
    now_et = datetime.now(et_tz)

    # Check if weekend
    if now_et.weekday() >= 5:  # Saturday=5, Sunday=6
        return False

    # Check market hours (9:30 AM - 4:00 PM ET)
    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)

    return market_open <= now_et <= market_close


def get_today_date_et() -> str:
    """Get today's date in ET timezone as YYYY-MM-DD"""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    et_tz = ZoneInfo('America/New_York')
    return datetime.now(et_tz).strftime('%Y-%m-%d')


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


def save_daily_nh_nl(sectors_data: list, date_str: str):
    """Save daily New Highs/New Lows data to cache"""
    history_key = "sector-rotation:nh-nl-history"
    history = get_cached(history_key) or {'days': []}

    # Create today's NH/NL summary
    day_data = {
        'date': date_str,
        'sectors': {}
    }

    for sector in sectors_data:
        day_data['sectors'][sector['shortName']] = {
            'nh': sector.get('newHighs', 0),
            'nl': sector.get('newLows', 0)
        }

    # Check if today already exists, update or append
    existing_idx = next((i for i, d in enumerate(history['days']) if d['date'] == date_str), None)
    if existing_idx is not None:
        history['days'][existing_idx] = day_data
    else:
        history['days'].append(day_data)

    # Keep only last 20 days
    history['days'] = sorted(history['days'], key=lambda x: x['date'], reverse=True)[:20]

    # Cache for 30 days
    set_cached(history_key, history, 30 * 24 * 3600)


def get_nh_nl_history() -> dict:
    """Get NH/NL history from cache"""
    history_key = "sector-rotation:nh-nl-history"
    return get_cached(history_key) or {'days': []}


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        refresh = req.params.get('refresh', '').lower() == 'true'
        history_only = req.params.get('history', '').lower() == 'true'

        # If only requesting history, return it
        if history_only:
            history = get_nh_nl_history()
            return func.HttpResponse(
                json.dumps(history),
                mimetype="application/json"
            )

        # Check market status
        market_open = is_market_open()
        cache_ttl = CACHE_TTL_MARKET_OPEN if market_open else CACHE_TTL_MARKET_CLOSED

        # Cache key
        cache_key = "sector-rotation:daily"

        # Check cache first (force cache when market closed unless explicit refresh)
        if not refresh or not market_open:
            cached_data = get_cached(cache_key)
            if cached_data:
                logging.info(f"Cache hit for sector-rotation (market_open={market_open})")
                cached_data['cached'] = True
                cached_data['marketOpen'] = market_open
                return func.HttpResponse(
                    json.dumps(cached_data),
                    mimetype="application/json"
                )

        logging.info(f"Fetching sector rotation data (market_open={market_open})...")

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        all_symbols = get_all_symbols()

        # Fetch snapshot data in batches - includes 52-week high/low
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
                    day_high = day.get('h', 0)
                    day_low = day.get('l', 0)

                    # Calculate daily change percent
                    change_pct = 0
                    if prev_close > 0:
                        change_pct = ((current_price - prev_close) / prev_close) * 100

                    # Get 52-week high/low from min/max aggregates
                    week52_high = ticker_data.get('min', {}).get('h', 0) or 0
                    week52_low = ticker_data.get('min', {}).get('l', 0) or 0

                    # Fallback: use prevDay high/low if min not available
                    if week52_high == 0:
                        week52_high = prev_day.get('h', current_price * 1.5)
                    if week52_low == 0:
                        week52_low = prev_day.get('l', current_price * 0.5)

                    # Determine if new 52-week high or low
                    # New high: today's high >= 52-week high (within 1%)
                    # New low: today's low <= 52-week low (within 1%)
                    is_new_high = day_high > 0 and week52_high > 0 and day_high >= week52_high * 0.99
                    is_new_low = day_low > 0 and week52_low > 0 and day_low <= week52_low * 1.01

                    all_quotes[symbol] = {
                        'price': current_price,
                        'changePercent': ticker_data.get('todaysChangePerc', change_pct),
                        'volume': day.get('v', 0),
                        'dayHigh': day_high,
                        'dayLow': day_low,
                        'week52High': week52_high,
                        'week52Low': week52_low,
                        'isNewHigh': is_new_high,
                        'isNewLow': is_new_low
                    }

        # Build sector data
        sectors_data = []

        for sector in SECTORS:
            stocks = []
            total_change = 0
            valid_count = 0
            new_highs = 0
            new_lows = 0

            for symbol in sector['stocks']:
                quote = all_quotes.get(symbol, {})

                if not quote.get('price'):
                    continue

                change_pct = quote.get('changePercent', 0)

                if quote.get('isNewHigh'):
                    new_highs += 1
                if quote.get('isNewLow'):
                    new_lows += 1

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
                'stocks': stocks,
                'newHighs': new_highs,
                'newLows': new_lows
            })

        today_date = get_today_date_et()

        response_data = {
            'timestamp': int(datetime.now().timestamp() * 1000),
            'date': today_date,
            'sectors': sectors_data,
            'cached': False,
            'marketOpen': market_open
        }

        # Cache the result
        set_cached(cache_key, response_data, cache_ttl)
        logging.info(f"Cached sector rotation data (TTL={cache_ttl}s)")

        # Save daily NH/NL data
        save_daily_nh_nl(sectors_data, today_date)

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
