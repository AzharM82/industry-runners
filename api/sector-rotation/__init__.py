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
from shared.timezone import today_pst, now_pst
from shared.market_calendar import is_market_open as is_trading_day

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_MARKET_OPEN = 60  # 1 minute during market hours
CACHE_TTL_MARKET_CLOSED = 3600  # 1 hour when market closed
CACHE_TTL_15DAY_DATA = 3600  # 1 hour cache for 15-day historical data

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


def get_today_date_pst() -> str:
    """Get today's date in PST timezone as YYYY-MM-DD (consistent with breadth indicators)"""
    return today_pst()


def is_business_day(date_str: str) -> bool:
    """Check if a date string (YYYY-MM-DD) is a market trading day (excludes weekends AND holidays)"""
    return is_trading_day(date_str)


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


def get_15day_high_low(symbols: list) -> dict:
    """Get 15-day high and low for all symbols (excluding today)"""
    cache_key = "sector-rotation:15day-highlow"
    cached = get_cached(cache_key)
    if cached:
        logging.info("Using cached 15-day high/low data")
        return cached

    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    et_tz = ZoneInfo('America/New_York')
    today = datetime.now(et_tz)

    # Get previous 15 trading days (exclude today)
    # Go back 25 calendar days to ensure we get enough trading days
    from_date = (today - timedelta(days=30)).strftime('%Y-%m-%d')
    to_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')  # Yesterday, exclude today

    result = {}

    # Fetch aggregates for each symbol
    for symbol in symbols:
        try:
            data = polygon_request(
                f"/v2/aggs/ticker/{symbol}/range/1/day/{from_date}/{to_date}?adjusted=true&sort=desc&limit=15",
                timeout=10
            )

            if '_error' not in data and data.get('results'):
                bars = data['results'][:15]  # Last 15 trading days before today
                if bars:
                    highs = [bar.get('h', 0) for bar in bars if bar.get('h')]
                    lows = [bar.get('l', 0) for bar in bars if bar.get('l')]

                    result[symbol] = {
                        'high15d': max(highs) if highs else 0,
                        'low15d': min(lows) if lows else 0
                    }
        except Exception as e:
            logging.warning(f"Error fetching 15-day data for {symbol}: {e}")
            continue

    # Cache for 1 hour
    if result:
        set_cached(cache_key, result, CACHE_TTL_15DAY_DATA)
        logging.info(f"Cached 15-day high/low data for {len(result)} symbols")

    return result


def save_daily_nh_nl(sectors_data: list, date_str: str):
    """Save daily New Highs/New Lows data to cache (trading days only)"""
    # Don't save non-trading-day data (weekends + holidays)
    if not is_business_day(date_str):
        logging.info(f"Skipping NH/NL save for non-trading day: {date_str}")
        return

    history_key = "sector-rotation:nh-nl-history"
    history = get_cached(history_key) or {'days': []}

    # Create today's NH/NL summary
    day_data = {
        'date': date_str,
        'sectors': {}
    }

    total_nh = 0
    total_nl = 0
    for sector in sectors_data:
        nh = sector.get('newHighs', 0)
        nl = sector.get('newLows', 0)
        day_data['sectors'][sector['shortName']] = {'nh': nh, 'nl': nl}
        total_nh += nh
        total_nl += nl

    # Don't overwrite existing data with all-zero values (stale snapshot after market close)
    existing_idx = next((i for i, d in enumerate(history['days']) if d['date'] == date_str), None)
    if total_nh == 0 and total_nl == 0 and existing_idx is not None:
        existing = history['days'][existing_idx]
        existing_nh = sum(v.get('nh', 0) for v in existing.get('sectors', {}).values())
        existing_nl = sum(v.get('nl', 0) for v in existing.get('sectors', {}).values())
        if existing_nh > 0 or existing_nl > 0:
            logging.info(f"Skipping NH/NL save: all zeros would overwrite existing data for {date_str}")
            return

    # Check if today already exists, update or append
    if existing_idx is not None:
        history['days'][existing_idx] = day_data
    else:
        history['days'].append(day_data)

    # Filter to business days only and keep last 20
    history['days'] = [d for d in history['days'] if is_business_day(d['date'])]
    history['days'] = sorted(history['days'], key=lambda x: x['date'], reverse=True)[:20]

    # Cache for 30 days
    set_cached(history_key, history, 30 * 24 * 3600)


def get_nh_nl_history() -> dict:
    """Get NH/NL history from cache (filtered to business days only)"""
    history_key = "sector-rotation:nh-nl-history"
    history = get_cached(history_key) or {'days': []}

    # Filter to business days only and exclude future dates
    today = today_pst()
    history['days'] = [
        d for d in history['days']
        if is_business_day(d['date']) and d['date'] <= today
    ]

    return history


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

        # Check cache first (skip cache when explicit refresh requested)
        if not refresh:
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

        # Get 15-day high/low data for all symbols
        # Clear cache on refresh to get fresh data
        if refresh:
            set_cached("sector-rotation:15day-highlow", None, 0)
        high_low_15d = get_15day_high_low(all_symbols)

        # Fetch snapshot data in batches
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

                    # Get 15-day high/low (from previous 15 days, excluding today)
                    symbol_15d = high_low_15d.get(symbol, {})
                    high_15d = symbol_15d.get('high15d', 0)
                    low_15d = symbol_15d.get('low15d', 0)

                    # Determine if new 15-day high or low
                    # New high: today's high > previous 15-day high (breaking out)
                    # New low: today's low < previous 15-day low (breaking down)
                    is_new_high = day_high > 0 and high_15d > 0 and day_high > high_15d
                    is_new_low = day_low > 0 and low_15d > 0 and day_low < low_15d

                    all_quotes[symbol] = {
                        'price': current_price,
                        'changePercent': ticker_data.get('todaysChangePerc', change_pct),
                        'volume': day.get('v', 0),
                        'dayHigh': day_high,
                        'dayLow': day_low,
                        'high15d': high_15d,
                        'low15d': low_15d,
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

        today_date = get_today_date_pst()

        response_data = {
            'timestamp': int(now_pst().timestamp() * 1000),
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
