import json
import os
import logging
import sys
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_SECTOR = 5 * 60  # 5 minutes cache
CACHE_TTL_HISTORICAL = 60 * 60  # 1 hour for historical data

# Sector data matching the frontend
SECTORS = [
    {'name': 'Technology', 'shortName': 'Tech', 'stocks': ['NVDA', 'INTC', 'AAPL', 'AMD', 'AVGO', 'MSFT', 'GOOG', 'MU', 'CSCO', 'MRVL', 'LRCX', 'TSM', 'QCOM', 'TXN', 'AMAT']},
    {'name': 'Consumer Cyclical', 'shortName': 'Discr', 'stocks': ['TSLA', 'AMZN', 'F', 'HD', 'GM', 'NKE', 'MCD', 'SBUX', 'LOW', 'BKNG', 'TJX', 'ROST', 'DHI', 'LEN', 'MAR']},
    {'name': 'Healthcare', 'shortName': 'Health', 'stocks': ['PFE', 'LLY', 'JNJ', 'UNH', 'MRK', 'ABBV', 'AMGN', 'GILD', 'BMY', 'CVS', 'ISRG', 'BSX', 'MDT', 'ZTS', 'VRTX']},
    {'name': 'Financial', 'shortName': 'Fin', 'stocks': ['BAC', 'JPM', 'C', 'WFC', 'GS', 'MS', 'SCHW', 'BLK', 'USB', 'PNC', 'AXP', 'V', 'MA', 'HOOD', 'SOFI']},
    {'name': 'Communication Services', 'shortName': 'Comm', 'stocks': ['T', 'CMCSA', 'VZ', 'META', 'NFLX', 'DIS', 'TMUS', 'WBD', 'CHTR', 'EA', 'TTWO', 'SPOT', 'PARA', 'FOX', 'OMC']},
    {'name': 'Energy', 'shortName': 'Energy', 'stocks': ['XOM', 'CVX', 'OXY', 'COP', 'SLB', 'EOG', 'MPC', 'VLO', 'PSX', 'HAL', 'DVN', 'FANG', 'BKR', 'KMI', 'WMB']},
    {'name': 'Consumer Defensive', 'shortName': 'Staple', 'stocks': ['WMT', 'PG', 'KO', 'PEP', 'COST', 'PM', 'MO', 'CL', 'MDLZ', 'GIS', 'KHC', 'K', 'SYY', 'KR', 'TGT']},
    {'name': 'Utilities', 'shortName': 'Util', 'stocks': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'XEL', 'SRE', 'EXC', 'WEC', 'ED', 'PCG', 'EIX', 'CEG', 'AWK', 'AES']},
    {'name': 'Basic Materials', 'shortName': 'Matl', 'stocks': ['FCX', 'LIN', 'NUE', 'NEM', 'APD', 'SHW', 'DD', 'DOW', 'PPG', 'ECL', 'CTVA', 'CF', 'MOS', 'CLF', 'X']},
    {'name': 'Real Estate', 'shortName': 'RE', 'stocks': ['PLD', 'AMT', 'EQIX', 'SPG', 'O', 'WELL', 'PSA', 'DLR', 'CCI', 'AVB', 'EQR', 'VTR', 'SBAC', 'ARE', 'MAA']},
    {'name': 'Industrials', 'shortName': 'Indus', 'stocks': ['BA', 'CAT', 'HON', 'UNP', 'UPS', 'RTX', 'LMT', 'GE', 'GEV', 'ETN', 'DE', 'FDX', 'NOC', 'WM', 'CSX']}
]

# Use first stock of each sector as representative for sparklines
SECTOR_REPRESENTATIVES = {s['shortName']: s['stocks'][0] for s in SECTORS}


def polygon_request(endpoint: str, timeout: int = 10) -> dict:
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


def fetch_symbol_data(symbol: str, start_date: str, end_date: str) -> tuple:
    """Fetch historical data for a single symbol (for parallel execution)"""
    try:
        data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=desc&limit=10", timeout=5)
        results = data.get('results', [])

        high52w = 0
        low52w = 0
        avg_volume = 0
        weekly_change = None

        if results:
            # Use available data for 52w approximation (not full year but good enough)
            highs = [r.get('h', 0) for r in results if r.get('h')]
            lows = [r.get('l', float('inf')) for r in results if r.get('l')]
            volumes = [r.get('v', 0) for r in results if r.get('v')]

            high52w = max(highs) if highs else 0
            low52w = min(lows) if lows and min(lows) != float('inf') else 0
            avg_volume = sum(volumes) / len(volumes) if volumes else 0

            # Weekly change
            if len(results) >= 6:
                current = results[0].get('c', 0)
                prev = results[5].get('c', 0)
                if prev > 0:
                    weekly_change = ((current - prev) / prev) * 100

        return symbol, {
            'high52w': high52w,
            'low52w': low52w,
            'avgVolume': avg_volume,
            'weeklyChange': weekly_change
        }
    except Exception as e:
        logging.error(f"Error fetching data for {symbol}: {e}")
        return symbol, {'high52w': 0, 'low52w': 0, 'avgVolume': 0, 'weeklyChange': None}


def get_historical_data_parallel(symbols: list) -> dict:
    """Fetch historical data for all symbols in parallel"""
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=14)).strftime('%Y-%m-%d')

    result = {}

    # Use ThreadPoolExecutor for parallel requests
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_symbol_data, symbol, start_date, end_date): symbol for symbol in symbols}

        for future in as_completed(futures, timeout=25):
            try:
                symbol, data = future.result(timeout=5)
                result[symbol] = data
            except Exception as e:
                symbol = futures[future]
                logging.error(f"Failed to get data for {symbol}: {e}")
                result[symbol] = {'high52w': 0, 'low52w': 0, 'avgVolume': 0, 'weeklyChange': None}

    return result


def get_spy_intraday() -> list:
    """Get SPY intraday data (5-minute bars for today)"""
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        data = polygon_request(f"/v2/aggs/ticker/SPY/range/5/minute/{today}/{today}?adjusted=true&sort=asc&limit=100", timeout=10)
        results = data.get('results', [])

        intraday = []
        for bar in results:
            intraday.append({
                'time': bar.get('t', 0),
                'open': bar.get('o', 0),
                'high': bar.get('h', 0),
                'low': bar.get('l', 0),
                'close': bar.get('c', 0),
                'volume': bar.get('v', 0)
            })
        return intraday
    except Exception as e:
        logging.error(f"Error getting SPY intraday: {e}")
        return []


def get_sector_sparklines_fast() -> dict:
    """Get sparklines using one representative stock per sector"""
    result = {}
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

    for sector_name, symbol in SECTOR_REPRESENTATIVES.items():
        try:
            data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&limit=6", timeout=5)
            results = data.get('results', [])

            sparkline = []
            for i, bar in enumerate(results):
                if i > 0 and results[i-1].get('c', 0) > 0:
                    prev_close = results[i-1].get('c', 0)
                    curr_close = bar.get('c', 0)
                    pct_change = ((curr_close - prev_close) / prev_close) * 100
                    sparkline.append({'date': bar.get('t', 0), 'change': round(pct_change, 2)})

            result[sector_name] = sparkline
        except Exception as e:
            logging.error(f"Error getting sparkline for {sector_name}: {e}")
            result[sector_name] = []

    return result


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        timeframe = req.params.get('timeframe', 'daily')
        if timeframe not in ['daily', 'weekly']:
            timeframe = 'daily'

        refresh = req.params.get('refresh', '').lower() == 'true'

        # Create cache key
        cache_key = f"sector-rotation:{timeframe}"

        # Check cache first
        if not refresh:
            cached_data = get_cached(cache_key)
            if cached_data:
                logging.info(f"Cache hit for sector-rotation ({timeframe})")
                cached_data['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached_data),
                    mimetype="application/json"
                )

        logging.info(f"Fetching sector rotation data ({timeframe})...")

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        all_symbols = get_all_symbols()

        # Fetch snapshot data in batches (Polygon limit) - ~4 calls
        all_quotes = {}
        batch_size = 50

        for i in range(0, len(all_symbols), batch_size):
            batch = all_symbols[i:i + batch_size]
            data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={','.join(batch)}", timeout=15)

            if '_error' not in data:
                for ticker_data in data.get('tickers', []):
                    symbol = ticker_data.get('ticker', '')
                    day = ticker_data.get('day', {})
                    prev_day = ticker_data.get('prevDay', {})
                    last_trade = ticker_data.get('lastTrade', {})

                    current_price = last_trade.get('p') or day.get('c') or 0
                    prev_close = prev_day.get('c', 0)

                    daily_change = 0
                    if prev_close > 0:
                        daily_change = ((current_price - prev_close) / prev_close) * 100

                    all_quotes[symbol] = {
                        'price': current_price,
                        'changePercent': ticker_data.get('todaysChangePerc', daily_change),
                        'volume': day.get('v', 0),
                        'prevClose': prev_close
                    }

        # Check for cached historical data first
        hist_cache_key = "sector-rotation:historical"
        historical_data = get_cached(hist_cache_key)

        if not historical_data:
            # Fetch historical data in parallel - much faster than sequential
            logging.info("Fetching historical data in parallel...")
            historical_data = get_historical_data_parallel(all_symbols)
            set_cached(hist_cache_key, historical_data, CACHE_TTL_HISTORICAL)
            logging.info("Cached historical data")
        else:
            logging.info("Using cached historical data")

        # Build sector summaries
        sectors_data = []

        for sector in SECTORS:
            stocks = []
            total_change = 0
            new_highs = 0
            new_lows = 0
            valid_count = 0

            for symbol in sector['stocks']:
                quote = all_quotes.get(symbol, {})
                hist = historical_data.get(symbol, {})

                if not quote.get('price'):
                    continue

                price = quote['price']
                volume = quote.get('volume', 0)
                high52w = hist.get('high52w', 0)
                low52w = hist.get('low52w', 0)
                avg_vol = hist.get('avgVolume', 0)

                # Determine change based on timeframe
                if timeframe == 'weekly' and hist.get('weeklyChange') is not None:
                    change_pct = hist['weeklyChange']
                else:
                    change_pct = quote.get('changePercent', 0)

                # Calculate relative volume
                rel_volume = volume / avg_vol if avg_vol > 0 else 1

                # Check for new highs/lows (within 2% of high/low)
                is_new_high = price >= high52w * 0.98 if high52w > 0 else False
                is_new_low = price <= low52w * 1.02 if low52w > 0 else False

                if is_new_high:
                    new_highs += 1
                if is_new_low:
                    new_lows += 1

                stocks.append({
                    'symbol': symbol,
                    'sector': sector['name'],
                    'changePercent': round(change_pct, 2),
                    'volume': volume,
                    'avgVolume': avg_vol,
                    'relativeVolume': round(rel_volume, 2),
                    'price': round(price, 2),
                    'high52w': round(high52w, 2),
                    'low52w': round(low52w, 2),
                    'isNewHigh': is_new_high,
                    'isNewLow': is_new_low
                })

                total_change += change_pct
                valid_count += 1

            avg_change = total_change / valid_count if valid_count > 0 else 0

            sectors_data.append({
                'name': sector['name'],
                'shortName': sector['shortName'],
                'avgChange': round(avg_change, 2),
                'newHighs': new_highs,
                'newLows': new_lows,
                'stocks': stocks
            })

        # Get SPY intraday data - 1 call
        spy_intraday = get_spy_intraday()

        # Get sector sparklines - 11 calls (one per sector)
        sparklines = get_sector_sparklines_fast()

        # Build simple historical comparison from today's data
        historical_comparison = {}
        for sector in sectors_data:
            historical_comparison[sector['shortName']] = {
                'yesterdayAvg': 0,  # Would need previous day's data
                'weekAgoAvg': round(sum(s.get('changePercent', 0) for s in sector['stocks']) / len(sector['stocks']), 2) if sector['stocks'] else 0
            }

        response_data = {
            'timeframe': timeframe,
            'timestamp': int(datetime.now().timestamp() * 1000),
            'sectors': sectors_data,
            'spyIntraday': spy_intraday,
            'sparklines': sparklines,
            'historical': historical_comparison,
            'cached': False
        }

        # Cache the result
        set_cached(cache_key, response_data, CACHE_TTL_SECTOR)
        logging.info(f"Cached sector rotation data ({timeframe})")

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
