import json
import os
import logging
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

# Breadth universe - combined list from ETFs, day trade stocks, and focus stocks
# This list should match the TypeScript getBreadthUniverse() function
BREADTH_UNIVERSE = [
    # From ETFs (etfs.ts holdings)
    'SMH', 'NVDA', 'TSM', 'AVGO', 'MU', 'ASML', 'LRCX', 'INTC', 'KLAC', 'AMD', 'AMAT', 'MRVL', 'QCOM', 'TXN', 'ON', 'MPWR', 'ADI', 'NXPI', 'SWKS',
    'FDN', 'META', 'AMZN', 'GOOGL', 'NFLX', 'CRM', 'ABNB', 'PYPL', 'SHOP', 'UBER', 'NOW', 'SPOT', 'PINS', 'SNAP', 'ZM', 'ETSY', 'GDDY', 'IAC', 'DBX',
    'IGV', 'MSFT', 'ADBE', 'INTU', 'ORCL', 'SNPS', 'PANW', 'CDNS', 'WDAY', 'DDOG', 'TEAM', 'PLTR', 'HUBS', 'VEEV', 'TTD', 'ANSS', 'MANH',
    'KWEB', 'TCEHY', 'BABA', 'PDD', 'MPNGY', 'NTES', 'KUAIY', 'JD', 'BIDU', 'TCOM', 'BEKE', 'BILI', 'LI', 'XPEV', 'NIO', 'ZTO', 'IQ', 'KC', 'BZUN',
    'CIBR', 'FTNT', 'CRWD', 'CSCO', 'OKTA', 'ZS', 'CHKP', 'GEN', 'BB', 'CYBR', 'QLYS', 'TENB', 'RPD', 'VRNS', 'S', 'FFIV', 'AKAM',
    'BLOK', 'BITB', 'IBIT', 'CME', 'CUBI', 'HUT', 'GLXY', 'HOOD', 'CIFR', 'CLSK', 'COIN', 'MARA', 'RIOT', 'MSTR', 'SQ', 'IBM', 'OSTK', 'SI', 'BTBT',
    'ROBO', 'ISRG', 'TER', 'ROK', 'NOVT', 'SYM', 'HON', 'ABB', 'IRBT', 'KUKA', 'FANUY', 'CGNX', 'BRKS', 'PATH', 'AI', 'UPST', 'BILL', 'MTSI', 'NNDM',
    'XLE', 'XOM', 'CVX', 'COP', 'SLB', 'WMB', 'EOG', 'PSX', 'VLO', 'KMI', 'MPC', 'HAL', 'OKE', 'DVN', 'FANG', 'BKR', 'TRGP', 'OXY', 'HES', 'CTRA',
    'XOP', 'TPL', 'PBF', 'MRO', 'APA', 'MGY', 'MTDR', 'CHRD', 'PR', 'SM', 'NOG', 'VTLE', 'AR',
    'TAN', 'FSLR', 'NXT', 'RUN', 'ENPH', 'HASI', 'SEDG', 'DQ', 'ARRY', 'NOVA', 'MAXN', 'CSIQ', 'SPWR', 'BEEM', 'SOL', 'JKS', 'SHLS', 'BE',
    'XME', 'AA', 'CDE', 'HL', 'HCC', 'FCX', 'RGLD', 'CLF', 'NEM', 'CMC', 'X', 'STLD', 'NUE', 'RS', 'ATI', 'CENX', 'BTU', 'ARCH', 'AMR',
    'XLB', 'LIN', 'APD', 'SHW', 'CTVA', 'ECL', 'DD', 'PPG', 'VMC', 'IFF', 'MLM', 'ALB', 'BALL', 'FMC', 'CF', 'MOS', 'CE', 'EMN',
    'GDX', 'AEM', 'GOLD', 'AU', 'WPM', 'GFI', 'FNV', 'KGC', 'PAAS', 'AGI', 'HMY', 'IAG', 'BTG', 'EGO', 'SSRM', 'MAG', 'EXK', 'NGD',
    'XLV', 'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN', 'PFE', 'SYK', 'GILD', 'REGN', 'MDT', 'CVS', 'ELV', 'CI', 'BMY',
    'XBI', 'RVMD', 'MRNA', 'FOLD', 'KRYS', 'ROIV', 'HALO', 'PRAX', 'EXEL', 'INCY', 'VRTX', 'BIIB', 'BMRN', 'ALNY', 'SRPT', 'ARGX', 'IONS', 'SGEN', 'UTHR',
    'MSOS', 'TCNNF', 'CURLF', 'GTBIF', 'CRLBF', 'GLASF', 'VRNOF', 'TSNDF', 'JUSHF', 'VFF', 'CXXIF', 'CGC', 'TLRY', 'ACB', 'OGI', 'CRON', 'SNDL', 'GRWG',
    'XLF', 'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'GS', 'WFC', 'MS', 'C', 'AXP', 'SPGI', 'BLK', 'CB', 'PGR', 'SCHW', 'MMC', 'ICE', 'AON', 'TRV',
    'XLY', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'BKNG', 'SBUX', 'TJX', 'ORLY', 'DHI', 'LEN', 'ROST', 'YUM', 'AZO', 'POOL', 'DECK', 'GRMN',
    'XRT', 'CVNA', 'KMX', 'AN', 'M', 'JWN', 'KSS', 'GPS', 'GME', 'BBY', 'TSCO', 'W', 'DKS', 'ULTA', 'BBWI', 'BOOT', 'BKE', 'FIVE', 'CAL',
    'XLP', 'PG', 'COST', 'PEP', 'KO', 'PM', 'WMT', 'MDLZ', 'MO', 'TGT', 'CL', 'KHC', 'GIS', 'SYY', 'HSY', 'K', 'CAG', 'TSN', 'HRL', 'CPB',
    'PEJ', 'DIS', 'MAR', 'HLT', 'RCL', 'CCL', 'CMG', 'DASH', 'DRI', 'LVS', 'MGM', 'WYNN', 'SIX', 'SEAS', 'LYV', 'MTCH', 'EXPE',
    'ITA', 'GE', 'RTX', 'BA', 'LHX', 'LMT', 'HWM', 'NOC', 'AXON', 'TDG', 'GD', 'HII', 'LDOS', 'SAIC', 'HEI', 'TXT', 'CW', 'SPR', 'ERJ',
    'ITB', 'NVR', 'PHM', 'TOL', 'OC', 'BLD', 'MHO', 'TMHC', 'KBH', 'MDC', 'MTH', 'CCS', 'GRBK', 'MAS', 'DOOR',
    'IYT', 'UNP', 'UPS', 'FDX', 'ODFL', 'CSX', 'NSC', 'R', 'LUV', 'DAL', 'UAL', 'JBHT', 'EXPD', 'XPO', 'KNX', 'SAIA', 'WERN', 'LSTR', 'SNDR', 'CHRW',
    'IYZ', 'CMCSA', 'T', 'VZ', 'TMUS', 'AMT', 'CCI', 'EQIX', 'SBAC', 'CHTR', 'LUMN', 'DISH', 'USM', 'GSAT', 'IRDM', 'LBRDA', 'CABO', 'SATS',
    # From daytrade.ts
    'WULF', 'BITF', 'HIVE', 'CAN', 'GREE', 'BKKT',
    'FSM', 'AG',
    'MP', 'UUUU', 'LAC', 'SVM', 'ZEUS',
    'RKLB', 'LUNR', 'KTOS', 'ASTS', 'RDW', 'GILT', 'MRCY', 'SPCE', 'MNTS', 'LLAP',
    'ET', 'PAA', 'WES', 'NOG', 'VET', 'ERF', 'SD', 'REI',
    'HUN', 'TROX', 'CC', 'KRO', 'MTX', 'CBT', 'GEVO', 'KALU', 'RYAM', 'IOSP',
    'SOFI', 'LC', 'NU', 'KEY', 'RF', 'HBAN', 'ZION', 'CMA', 'FHN',
    'OVV', 'CNX', 'RRC', 'CPE', 'TELL', 'RIG', 'PTEN',
    'BGS', 'HAIN', 'THS', 'UNFI', 'SPTN', 'SMPL', 'FARM', 'JBSS', 'NOMD',
    'BEAM', 'CRSP', 'NTLA', 'EDIT', 'ARWR', 'RCKT', 'QURE',
    'AEO', 'EXPR', 'TLYS', 'ZUMZ', 'CATO', 'SBH', 'CTRN', 'SCVL', 'HIBB',
    'LCID', 'RIVN', 'LAZR', 'GOEV', 'NKLA', 'WKHS', 'PRTS', 'NIU', 'FUV', 'SOLO',
    'GOGO', 'VSAT', 'COMM', 'CASA', 'VIAV',
    'ZIM', 'GXO', 'HTLD', 'MRTN', 'ARCB', 'ULH', 'CVLG',
    'HIMS', 'TDOC', 'DOCS', 'GDRX', 'OSCR', 'CLOV', 'PGNY', 'PHR', 'ACCD', 'TALK',
    'WOLF', 'QRVO', 'DIOD', 'CRUS', 'AMBA', 'AOSL', 'NVTS', 'SIMO',
    'RDWR', 'OSPN', 'PING', 'IDCC', 'VRY',
    'OUST', 'INVZ', 'AEVA', 'PRCT',
    'DKNG', 'PENN', 'RRR', 'GDEN', 'BALY', 'AGS', 'EVRI', 'RSI', 'SRAD', 'GAN',
    'TAL', 'GOTU', 'YMM', 'QFIN', 'FINV',
    'BZH', 'HOV', 'SKY', 'DFH', 'TPH', 'LEGH', 'UHG',
    'BMBL', 'YELP', 'ANGI', 'CARG', 'CARS', 'FVRR', 'UPWK',
    'U', 'ZI', 'FROG', 'DOCN', 'ZEN', 'DOCU', 'ESTC', 'MDB',
    # From focusstocks.ts (additional unique symbols)
    'A', 'AAPL', 'ACN', 'ADP', 'ADSK', 'AFRM', 'AJG', 'ALAB', 'ALGN', 'ALL', 'ALLE',
    'AME', 'AMKR', 'AMP', 'ANET', 'APLD', 'APO', 'APP', 'ARES', 'ARM', 'ASND',
    'AVAV', 'AVB', 'AVY', 'BAH', 'BBIO', 'BDX', 'BLDR', 'BNTX', 'BR', 'BURL', 'BWXT', 'BX',
    'CAH', 'CAT', 'CBOE', 'CBRE', 'CCJ', 'CDW', 'CEG', 'CIEN', 'CLH', 'CLS',
    'CMI', 'COF', 'COHR', 'COKE', 'COR', 'CPAY', 'CRCL', 'CRDO', 'CRH', 'CRL', 'CRS', 'CRWV', 'CTAS',
    'DE', 'DELL', 'DG', 'DGX', 'DLR', 'DLTR', 'DOV', 'DPZ',
    'EFX', 'EL', 'EMR', 'ENTG', 'EPAM', 'ESS', 'ETN', 'EXE', 'EXR',
    'FDS', 'FERG', 'FIGR', 'FIX', 'FLUT', 'FN', 'FTAI', 'FUTU',
    'GEV', 'GH', 'GLW', 'GNRC', 'GOOG', 'GWRE',
    'H', 'HCA', 'HUBB', 'HUM',
    'ICLR', 'IDXX', 'IEX', 'ILMN', 'INSM', 'IONQ', 'IQV', 'IREN', 'IT', 'ITT', 'ITW',
    'J', 'JAZZ', 'JBL', 'JKHY',
    'KEYS', 'KKR', 'KRMN',
    'LH', 'LITE', 'LNG', 'LPLA', 'LSCC', 'LULU',
    'MCK', 'MCO', 'MELI', 'MKSI', 'MMM', 'MOH', 'MRSH', 'MSCI', 'MSI', 'MTB', 'MTZ',
    'NBIS', 'NBIX', 'NET', 'NRG', 'NTAP', 'NTRA', 'NTRS', 'NVT',
    'OKLO', 'ONTO',
    'PEN', 'PH', 'PKG', 'PNC', 'PNFP', 'PODD', 'PSA', 'PSTG', 'PTC', 'PWR',
    'Q', 'RACE', 'RBLX', 'RDDT', 'RJF', 'RL', 'RMBS', 'RMD', 'ROKU', 'ROP', 'RRX', 'RVTY',
    'SAP', 'SCCO', 'SE', 'SF', 'SNDK', 'SNOW', 'SNX', 'SPG', 'SPXC', 'STE', 'STRL', 'STT', 'STX', 'STZ',
    'TEL', 'TEM', 'THC', 'TKO', 'TLN', 'TPR', 'TSEM', 'TT', 'TTWO', 'TWLO', 'TXRH',
    'UHS', 'URI',
    'VRSK', 'VRSN', 'VRT', 'VST',
    'WAB', 'WAT', 'WCC', 'WDC', 'WELL', 'WLK', 'WM', 'WMS', 'WSM', 'WST', 'WTW', 'WWD',
    'ZBRA'
]

# Remove duplicates and sort
BREADTH_UNIVERSE = sorted(list(set(BREADTH_UNIVERSE)))


def polygon_request(endpoint: str) -> dict:
    """Make a request to Polygon API"""
    url = f"{POLYGON_BASE_URL}{endpoint}"
    if '?' in url:
        url += f"&apiKey={POLYGON_API_KEY}"
    else:
        url += f"?apiKey={POLYGON_API_KEY}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})
        with urllib.request.urlopen(req, timeout=60, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {'_error': str(e)}


def get_trading_date_n_days_ago(n_days: int) -> str:
    """Get the trading date approximately n calendar days ago."""
    # Add buffer for weekends and holidays
    buffer_days = (n_days // 5) * 2 + 5  # Extra days for weekends/holidays
    target_date = datetime.now() - timedelta(days=n_days + buffer_days)
    return target_date.strftime('%Y-%m-%d')


def get_grouped_daily(date: str) -> dict:
    """
    Get the daily data for all stocks on a specific date using grouped daily endpoint.
    Returns dict of symbol -> {open, close, high, low, volume}
    """
    data = polygon_request(f"/v2/aggs/grouped/locale/us/market/stocks/{date}?adjusted=true")

    results = {}
    if '_error' not in data:
        for result in data.get('results', []):
            symbol = result.get('T', '')
            if symbol:
                results[symbol] = {
                    'open': result.get('o', 0),
                    'close': result.get('c', 0),
                    'high': result.get('h', 0),
                    'low': result.get('l', 0),
                    'volume': result.get('v', 0)
                }

    return results


def get_grouped_daily_close(date: str) -> dict:
    """
    Get the closing prices for all stocks on a specific date using grouped daily endpoint.
    Returns dict of symbol -> close price
    """
    daily_data = get_grouped_daily(date)
    return {symbol: data['close'] for symbol, data in daily_data.items() if data['close'] > 0}


def get_historical_closes(symbols: list, days_ago: int) -> dict:
    """
    Get historical closing prices for symbols from approximately N days ago.
    Uses the grouped daily endpoint which is more efficient for many symbols.
    """
    # Calculate date approximately N trading days ago
    # Assuming ~252 trading days per year, roughly 21 per month
    calendar_days = int(days_ago * 1.45)  # Approximate calendar days from trading days
    target_date = datetime.now() - timedelta(days=calendar_days)

    # Try a few dates in case of holidays
    for offset in range(5):
        check_date = (target_date - timedelta(days=offset)).strftime('%Y-%m-%d')
        prices = get_grouped_daily_close(check_date)
        if prices:
            return prices

    return {}


def get_trading_dates(num_days: int) -> list:
    """
    Get a list of the last N trading dates (excluding weekends).
    Returns dates in descending order (most recent first).
    """
    dates = []
    current = datetime.now()

    while len(dates) < num_days:
        current = current - timedelta(days=1)
        # Skip weekends (5=Saturday, 6=Sunday)
        if current.weekday() < 5:
            dates.append(current.strftime('%Y-%m-%d'))

    return dates


def calculate_daily_movers(daily_data: dict, prev_daily_data: dict, universe: list) -> tuple:
    """
    Calculate up 4%+ and down 4%+ counts for a single day.
    Returns (up_count, down_count)
    """
    up_count = 0
    down_count = 0

    for symbol in universe:
        if symbol not in daily_data or symbol not in prev_daily_data:
            continue

        current_close = daily_data[symbol].get('close', 0) if isinstance(daily_data[symbol], dict) else daily_data[symbol]
        prev_close = prev_daily_data[symbol].get('close', 0) if isinstance(prev_daily_data[symbol], dict) else prev_daily_data[symbol]

        if current_close > 0 and prev_close > 0:
            change_pct = ((current_close - prev_close) / prev_close) * 100
            if change_pct >= 4:
                up_count += 1
            elif change_pct <= -4:
                down_count += 1

    return up_count, down_count


def calculate_rolling_ratios(universe: list) -> tuple:
    """
    Calculate 5-day and 10-day rolling up/down ratios.
    Returns (ratio_5day, ratio_10day)
    """
    # Get the last 12 trading dates (need 11 for 10 days of changes + 1 previous)
    dates = get_trading_dates(12)

    # Fetch daily data for each date
    daily_data_cache = {}
    for date in dates:
        daily_data_cache[date] = get_grouped_daily(date)

    # Calculate up/down counts for each of the last 10 days
    daily_counts = []
    for i in range(10):
        if i + 1 >= len(dates):
            break

        current_date = dates[i]
        prev_date = dates[i + 1]

        current_data = daily_data_cache.get(current_date, {})
        prev_data = daily_data_cache.get(prev_date, {})

        if current_data and prev_data:
            up, down = calculate_daily_movers(current_data, prev_data, universe)
            daily_counts.append({'up': up, 'down': down})

    # Calculate 5-day ratio (average of last 5 days)
    ratio_5day = None
    if len(daily_counts) >= 5:
        total_up_5 = sum(d['up'] for d in daily_counts[:5])
        total_down_5 = sum(d['down'] for d in daily_counts[:5])
        if total_down_5 > 0:
            ratio_5day = round(total_up_5 / total_down_5, 2)
        elif total_up_5 > 0:
            ratio_5day = 99.99  # Very high ratio when no down movers

    # Calculate 10-day ratio (average of last 10 days)
    ratio_10day = None
    if len(daily_counts) >= 10:
        total_up_10 = sum(d['up'] for d in daily_counts[:10])
        total_down_10 = sum(d['down'] for d in daily_counts[:10])
        if total_down_10 > 0:
            ratio_10day = round(total_up_10 / total_down_10, 2)
        elif total_up_10 > 0:
            ratio_10day = 99.99  # Very high ratio when no down movers

    return ratio_5day, ratio_10day


def calculate_t2108(snapshots: dict, universe: list) -> float:
    """
    Calculate T2108: percentage of stocks above their 40-day moving average.
    """
    # Get the last 45 trading dates for 40-day MA calculation
    dates = get_trading_dates(45)

    if len(dates) < 40:
        return None

    # Fetch daily close data for each date
    price_history = {}  # symbol -> list of closes (oldest to newest)

    for date in reversed(dates[:40]):  # Get 40 days, oldest first
        daily_closes = get_grouped_daily_close(date)
        for symbol in universe:
            if symbol in daily_closes:
                if symbol not in price_history:
                    price_history[symbol] = []
                price_history[symbol].append(daily_closes[symbol])

    # Calculate how many stocks are above their 40-day MA
    above_ma_count = 0
    total_valid = 0

    for symbol in universe:
        # Get current price from snapshot
        if symbol not in snapshots:
            continue

        snap = snapshots[symbol]
        day = snap.get('day', {})
        last_trade = snap.get('lastTrade', {})

        current_price = (
            last_trade.get('p') or
            day.get('c') or
            snap.get('min', {}).get('c') or
            0
        )

        if current_price <= 0:
            continue

        # Calculate 40-day MA
        history = price_history.get(symbol, [])
        if len(history) >= 40:
            ma_40 = sum(history[-40:]) / 40
            total_valid += 1
            if current_price > ma_40:
                above_ma_count += 1

    if total_valid == 0:
        return None

    return round((above_ma_count / total_valid) * 100, 1)


def fetch_current_snapshots(symbols: list) -> dict:
    """
    Fetch current snapshots for symbols in batches.
    Returns dict of symbol -> snapshot data
    """
    snapshots = {}
    batch_size = 100  # Polygon limit per request

    for i in range(0, len(symbols), batch_size):
        batch = symbols[i:i + batch_size]
        tickers_param = ','.join(batch)

        data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers?tickers={tickers_param}")

        if '_error' not in data:
            for ticker_data in data.get('tickers', []):
                symbol = ticker_data.get('ticker', '')
                if symbol:
                    snapshots[symbol] = ticker_data

    return snapshots


def calculate_breadth_indicators(snapshots: dict, hist_21: dict, hist_34: dict, hist_63: dict, ratio_5day: float, ratio_10day: float, t2108: float) -> dict:
    """
    Calculate all breadth indicators from snapshot and historical data.
    """
    # Initialize counters
    up_4_today = 0
    down_4_today = 0
    up_25_quarter = 0
    down_25_quarter = 0
    up_25_month = 0
    down_25_month = 0
    up_50_month = 0
    down_50_month = 0
    up_13_34days = 0
    down_13_34days = 0

    # SPY data
    spy_value = 0
    spy_change = 0
    spy_change_pct = 0

    for symbol, snap in snapshots.items():
        # Get current price
        day = snap.get('day', {})
        last_trade = snap.get('lastTrade', {})
        prev_day = snap.get('prevDay', {})

        current_price = (
            last_trade.get('p') or
            day.get('c') or
            snap.get('min', {}).get('c') or
            0
        )

        if current_price <= 0:
            continue

        # Get previous close for daily change calculation
        prev_close = prev_day.get('c', 0)

        # Calculate daily change percent
        change_pct = snap.get('todaysChangePerc', 0)
        if change_pct == 0 and prev_close > 0:
            change_pct = ((current_price - prev_close) / prev_close) * 100

        # Handle SPY separately
        if symbol == 'SPY':
            spy_value = current_price
            spy_change = snap.get('todaysChange', 0)
            spy_change_pct = change_pct
            continue

        # Count daily movers (4%+)
        if change_pct >= 4:
            up_4_today += 1
        elif change_pct <= -4:
            down_4_today += 1

        # Quarter calculation (63 trading days ago)
        hist_price_63 = hist_63.get(symbol, 0)
        if hist_price_63 > 0:
            quarter_change = ((current_price - hist_price_63) / hist_price_63) * 100
            if quarter_change >= 25:
                up_25_quarter += 1
            elif quarter_change <= -25:
                down_25_quarter += 1

        # Month calculation (21 trading days ago)
        hist_price_21 = hist_21.get(symbol, 0)
        if hist_price_21 > 0:
            month_change = ((current_price - hist_price_21) / hist_price_21) * 100
            if month_change >= 25:
                up_25_month += 1
            elif month_change <= -25:
                down_25_month += 1
            if month_change >= 50:
                up_50_month += 1
            elif month_change <= -50:
                down_50_month += 1

        # 34-day calculation
        hist_price_34 = hist_34.get(symbol, 0)
        if hist_price_34 > 0:
            change_34 = ((current_price - hist_price_34) / hist_price_34) * 100
            if change_34 >= 13:
                up_13_34days += 1
            elif change_34 <= -13:
                down_13_34days += 1

    return {
        'primary': {
            'up4PlusToday': up_4_today,
            'down4PlusToday': down_4_today,
            'ratio5Day': ratio_5day,
            'ratio10Day': ratio_10day,
            'up25PlusQuarter': up_25_quarter,
            'down25PlusQuarter': down_25_quarter
        },
        'secondary': {
            'up25PlusMonth': up_25_month,
            'down25PlusMonth': down_25_month,
            'up50PlusMonth': up_50_month,
            'down50PlusMonth': down_50_month,
            'up13Plus34Days': up_13_34days,
            'down13Plus34Days': down_13_34days
        },
        'market': {
            'spyValue': round(spy_value, 2),
            'spyChange': round(spy_change, 2),
            'spyChangePercent': round(spy_change_pct, 2)
        },
        't2108': t2108
    }


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        # Add SPY to universe for market data
        universe = BREADTH_UNIVERSE + ['SPY']

        logging.info(f"Fetching breadth data for {len(universe)} symbols")

        # Fetch current snapshots for all symbols
        snapshots = fetch_current_snapshots(universe)

        logging.info(f"Got {len(snapshots)} snapshots")

        # Fetch historical data for period calculations
        # 21 trading days = ~1 month
        # 34 trading days = ~1.5 months
        # 63 trading days = ~1 quarter
        hist_21 = get_historical_closes(BREADTH_UNIVERSE, 21)
        hist_34 = get_historical_closes(BREADTH_UNIVERSE, 34)
        hist_63 = get_historical_closes(BREADTH_UNIVERSE, 63)

        logging.info(f"Got historical data: 21d={len(hist_21)}, 34d={len(hist_34)}, 63d={len(hist_63)}")

        # Calculate rolling ratios (5-day and 10-day)
        logging.info("Calculating rolling ratios...")
        ratio_5day, ratio_10day = calculate_rolling_ratios(BREADTH_UNIVERSE)
        logging.info(f"Rolling ratios: 5D={ratio_5day}, 10D={ratio_10day}")

        # Calculate T2108 (% above 40-day MA)
        logging.info("Calculating T2108...")
        t2108 = calculate_t2108(snapshots, BREADTH_UNIVERSE)
        logging.info(f"T2108: {t2108}%")

        # Calculate breadth indicators
        indicators = calculate_breadth_indicators(snapshots, hist_21, hist_34, hist_63, ratio_5day, ratio_10day, t2108)

        # Build response
        response = {
            'date': datetime.now().strftime('%Y-%m-%d'),
            'timestamp': int(datetime.now().timestamp() * 1000),
            'universeCount': len(BREADTH_UNIVERSE),
            **indicators
        }

        return func.HttpResponse(
            json.dumps(response),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in breadth endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
