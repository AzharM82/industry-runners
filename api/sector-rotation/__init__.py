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
CACHE_TTL_SECTOR = 5 * 60  # 5 minutes cache
CACHE_TTL_INTRADAY = 60  # 1 minute for intraday data

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


def get_all_symbols() -> list:
    """Get all unique symbols from all sectors"""
    symbols = set()
    for sector in SECTORS:
        for stock in sector['stocks']:
            symbols.add(stock)
    return list(symbols)


def get_52_week_high_low(symbols: list) -> dict:
    """Get 52-week high/low for a batch of symbols using Polygon's ticker details"""
    result = {}

    # Get aggregates for each symbol over the past year
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')

    for symbol in symbols:
        try:
            data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&limit=260")
            results = data.get('results', [])
            if results:
                highs = [r.get('h', 0) for r in results if r.get('h')]
                lows = [r.get('l', float('inf')) for r in results if r.get('l')]
                result[symbol] = {
                    'high52w': max(highs) if highs else 0,
                    'low52w': min(lows) if lows and min(lows) != float('inf') else 0
                }
        except Exception as e:
            logging.error(f"Error getting 52-week data for {symbol}: {e}")
            result[symbol] = {'high52w': 0, 'low52w': 0}

    return result


def get_weekly_change(symbols: list) -> dict:
    """Get the percentage change over 5 trading days"""
    result = {}
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=10)).strftime('%Y-%m-%d')

    for symbol in symbols:
        try:
            data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=desc&limit=10")
            results = data.get('results', [])
            if len(results) >= 6:
                current_close = results[0].get('c', 0)
                prev_close = results[5].get('c', 0)
                if prev_close > 0:
                    result[symbol] = ((current_close - prev_close) / prev_close) * 100
        except Exception as e:
            logging.error(f"Error getting weekly change for {symbol}: {e}")

    return result


def get_avg_volume(symbols: list) -> dict:
    """Get 20-day average volume for symbols"""
    result = {}
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    for symbol in symbols:
        try:
            data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=desc&limit=20")
            results = data.get('results', [])
            if results:
                volumes = [r.get('v', 0) for r in results if r.get('v')]
                result[symbol] = sum(volumes) / len(volumes) if volumes else 0
        except Exception as e:
            logging.error(f"Error getting avg volume for {symbol}: {e}")

    return result


def get_spy_intraday() -> list:
    """Get SPY intraday data (5-minute bars for today)"""
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        data = polygon_request(f"/v2/aggs/ticker/SPY/range/5/minute/{today}/{today}?adjusted=true&sort=asc&limit=100")
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


def get_sector_sparklines(sectors: list, all_quotes: dict) -> dict:
    """Get 5-day performance data for each sector (for sparklines)"""
    result = {}
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

    for sector in sectors:
        sector_name = sector['shortName']
        daily_changes = {}

        for symbol in sector['stocks'][:5]:  # Use top 5 stocks for efficiency
            try:
                data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&limit=5")
                results = data.get('results', [])

                for i, bar in enumerate(results):
                    date_key = bar.get('t', 0)
                    if date_key not in daily_changes:
                        daily_changes[date_key] = []

                    if i > 0 and results[i-1].get('c', 0) > 0:
                        prev_close = results[i-1].get('c', 0)
                        curr_close = bar.get('c', 0)
                        pct_change = ((curr_close - prev_close) / prev_close) * 100
                        daily_changes[date_key].append(pct_change)
            except Exception as e:
                logging.error(f"Error getting sparkline for {symbol}: {e}")

        # Calculate average change per day
        sparkline = []
        for date_key in sorted(daily_changes.keys()):
            changes = daily_changes[date_key]
            if changes:
                avg = sum(changes) / len(changes)
                sparkline.append({'date': date_key, 'change': round(avg, 2)})

        result[sector_name] = sparkline

    return result


def get_historical_comparison(sectors_data: list) -> dict:
    """Get yesterday's sector averages for comparison"""
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=3)).strftime('%Y-%m-%d')

    comparison = {}

    for sector in SECTORS:
        yesterday_changes = []
        week_ago_changes = []

        for symbol in sector['stocks'][:5]:  # Use top 5 for efficiency
            try:
                data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=desc&limit=7")
                results = data.get('results', [])

                if len(results) >= 2:
                    # Yesterday's change
                    if results[1].get('c', 0) > 0:
                        prev = results[1].get('c', 0)
                        curr = results[0].get('c', 0)
                        yesterday_changes.append(((curr - prev) / prev) * 100)

                if len(results) >= 6:
                    # Week ago change (5 days ago)
                    if results[5].get('c', 0) > 0:
                        prev = results[5].get('c', 0)
                        curr = results[0].get('c', 0)
                        week_ago_changes.append(((curr - prev) / prev) * 100)
            except Exception as e:
                logging.error(f"Error getting historical for {symbol}: {e}")

        comparison[sector['shortName']] = {
            'yesterdayAvg': round(sum(yesterday_changes) / len(yesterday_changes), 2) if yesterday_changes else 0,
            'weekAgoAvg': round(sum(week_ago_changes) / len(week_ago_changes), 2) if week_ago_changes else 0
        }

    return comparison


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

        # Fetch snapshot data in batches (Polygon limit)
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

                    daily_change = 0
                    if prev_close > 0:
                        daily_change = ((current_price - prev_close) / prev_close) * 100

                    all_quotes[symbol] = {
                        'price': current_price,
                        'changePercent': ticker_data.get('todaysChangePerc', daily_change),
                        'volume': day.get('v', 0),
                        'prevClose': prev_close
                    }

        # Get additional data based on timeframe
        weekly_changes = {}
        if timeframe == 'weekly':
            weekly_changes = get_weekly_change(all_symbols)

        # Get 52-week high/low and average volume (for all symbols)
        high_low_data = get_52_week_high_low(all_symbols)
        avg_volumes = get_avg_volume(all_symbols)

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
                hl_data = high_low_data.get(symbol, {})
                avg_vol = avg_volumes.get(symbol, 0)

                if not quote.get('price'):
                    continue

                price = quote['price']
                volume = quote.get('volume', 0)
                high52w = hl_data.get('high52w', 0)
                low52w = hl_data.get('low52w', 0)

                # Determine change based on timeframe
                if timeframe == 'weekly' and symbol in weekly_changes:
                    change_pct = weekly_changes[symbol]
                else:
                    change_pct = quote.get('changePercent', 0)

                # Calculate relative volume
                rel_volume = volume / avg_vol if avg_vol > 0 else 1

                # Check for new highs/lows (within 2% of 52-week high/low)
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

        # Get SPY intraday data
        spy_intraday = get_spy_intraday()

        # Get sector sparklines (5-day performance)
        sparklines = get_sector_sparklines(SECTORS, all_quotes)

        # Get historical comparison data
        historical = get_historical_comparison(sectors_data)

        response_data = {
            'timeframe': timeframe,
            'timestamp': int(datetime.now().timestamp() * 1000),
            'sectors': sectors_data,
            'spyIntraday': spy_intraday,
            'sparklines': sparklines,
            'historical': historical,
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
