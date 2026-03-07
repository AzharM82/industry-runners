"""
Fix endpoint for real-time breadth history.
Reconstructs real-time breadth data for a specific past date using Polygon historical data.
Usage:
  /api/fix-realtime-breadth?date=2026-03-03  — backfill real-time breadth for March 3rd
"""

import json
import os
import sys
import logging
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import save_daily_snapshot
from shared.timezone import now_pst
from shared.market_calendar import is_market_open as is_trading_day

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

# Same universe as breadth/__init__.py
BREADTH_UNIVERSE = [
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


def get_grouped_daily(date: str) -> dict:
    """Get daily data for all stocks on a specific date."""
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
    """Get closing prices for all stocks on a specific date."""
    daily_data = get_grouped_daily(date)
    return {symbol: data['close'] for symbol, data in daily_data.items() if data['close'] > 0}


def get_prev_trading_date(date_str: str) -> str:
    """Get the previous trading date before the given date."""
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    for offset in range(1, 10):
        prev = (dt - timedelta(days=offset)).strftime('%Y-%m-%d')
        if is_trading_day(prev):
            return prev
    return (dt - timedelta(days=1)).strftime('%Y-%m-%d')


def get_trading_dates_before(date_str: str, num_days: int) -> list:
    """Get a list of the last N trading dates before the given date (most recent first)."""
    dates = []
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    current = dt - timedelta(days=1)
    while len(dates) < num_days:
        if current.weekday() < 5 and is_trading_day(current.strftime('%Y-%m-%d')):
            dates.append(current.strftime('%Y-%m-%d'))
        current = current - timedelta(days=1)
        if (dt - current).days > 200:
            break
    return dates


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        target_date = req.params.get('date', '')
        if not target_date:
            return func.HttpResponse(
                json.dumps({
                    'usage': '/api/fix-realtime-breadth?date=YYYY-MM-DD',
                    'description': 'Backfill real-time breadth data for a specific past date using Polygon historical data'
                }),
                mimetype="application/json"
            )

        # Validate trading day
        if not is_trading_day(target_date):
            return func.HttpResponse(
                json.dumps({
                    'error': f'{target_date} is not a trading day (weekend or holiday)',
                }),
                status_code=400,
                mimetype="application/json"
            )

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        debug_info = [f"Target date: {target_date}"]
        universe = BREADTH_UNIVERSE

        # 1. Fetch target date and previous day grouped data
        prev_date = get_prev_trading_date(target_date)
        debug_info.append(f"Previous trading date: {prev_date}")

        target_data = get_grouped_daily(target_date)
        prev_data = get_grouped_daily(prev_date)
        debug_info.append(f"Target date symbols: {len(target_data)}")
        debug_info.append(f"Previous date symbols: {len(prev_data)}")

        if not target_data:
            return func.HttpResponse(
                json.dumps({
                    'error': f'No Polygon data available for {target_date}',
                    'debug': debug_info
                }),
                status_code=400,
                mimetype="application/json"
            )

        # 2. Calculate up 4%+ and down 4%+ from universe
        up_4_today = 0
        down_4_today = 0
        spy_value = 0
        spy_change = 0
        spy_change_pct = 0

        for symbol in universe + ['SPY']:
            if symbol not in target_data or symbol not in prev_data:
                continue

            current_close = target_data[symbol]['close']
            prev_close = prev_data[symbol]['close']

            if current_close <= 0 or prev_close <= 0:
                continue

            change_pct = ((current_close - prev_close) / prev_close) * 100

            if symbol == 'SPY':
                spy_value = current_close
                spy_change = round(current_close - prev_close, 2)
                spy_change_pct = round(change_pct, 2)
                continue

            if change_pct >= 4:
                up_4_today += 1
            elif change_pct <= -4:
                down_4_today += 1

        debug_info.append(f"Up 4%+: {up_4_today}, Down 4%+: {down_4_today}")
        debug_info.append(f"SPY: {spy_value} ({spy_change_pct}%)")

        # 3. Calculate rolling ratios (5-day and 10-day) ending at target_date
        trading_dates = [target_date] + get_trading_dates_before(target_date, 11)
        debug_info.append(f"Trading dates for rolling calc: {len(trading_dates)}")

        daily_data_cache = {}
        for date in trading_dates:
            daily_data_cache[date] = get_grouped_daily(date)

        daily_counts = []
        for i in range(min(10, len(trading_dates) - 1)):
            current_d = trading_dates[i]
            prev_d = trading_dates[i + 1]
            curr_data = daily_data_cache.get(current_d, {})
            prev_d_data = daily_data_cache.get(prev_d, {})

            if curr_data and prev_d_data:
                up = 0
                down = 0
                for sym in universe:
                    if sym not in curr_data or sym not in prev_d_data:
                        continue
                    cc = curr_data[sym]['close'] if isinstance(curr_data[sym], dict) else curr_data[sym]
                    pc = prev_d_data[sym]['close'] if isinstance(prev_d_data[sym], dict) else prev_d_data[sym]
                    if cc > 0 and pc > 0:
                        pct = ((cc - pc) / pc) * 100
                        if pct >= 4:
                            up += 1
                        elif pct <= -4:
                            down += 1
                daily_counts.append({'up': up, 'down': down})

        ratio_5day = None
        if len(daily_counts) >= 5:
            total_up = sum(d['up'] for d in daily_counts[:5])
            total_down = sum(d['down'] for d in daily_counts[:5])
            if total_down > 0:
                ratio_5day = round(total_up / total_down, 2)
            elif total_up > 0:
                ratio_5day = 99.99

        ratio_10day = None
        if len(daily_counts) >= 10:
            total_up = sum(d['up'] for d in daily_counts[:10])
            total_down = sum(d['down'] for d in daily_counts[:10])
            if total_down > 0:
                ratio_10day = round(total_up / total_down, 2)
            elif total_up > 0:
                ratio_10day = 99.99

        debug_info.append(f"Rolling ratios: 5D={ratio_5day}, 10D={ratio_10day}")

        # 4. Calculate historical comparisons (quarter, month, 34-day)
        def get_historical_close_for_date(days_ago: int) -> dict:
            """Get closes from approximately N trading days before target_date."""
            calendar_days = int(days_ago * 1.45)
            target_dt = datetime.strptime(target_date, '%Y-%m-%d')
            dt = target_dt - timedelta(days=calendar_days)
            for offset in range(5):
                check_date = (dt - timedelta(days=offset)).strftime('%Y-%m-%d')
                prices = get_grouped_daily_close(check_date)
                if prices:
                    return prices
            return {}

        hist_21 = get_historical_close_for_date(21)
        hist_34 = get_historical_close_for_date(34)
        hist_63 = get_historical_close_for_date(63)

        debug_info.append(f"Historical data: 21d={len(hist_21)}, 34d={len(hist_34)}, 63d={len(hist_63)}")

        # Calculate movers
        up_25_quarter = 0
        down_25_quarter = 0
        up_25_month = 0
        down_25_month = 0
        up_50_month = 0
        down_50_month = 0
        up_13_34days = 0
        down_13_34days = 0

        for symbol in universe:
            if symbol not in target_data:
                continue
            current_price = target_data[symbol]['close']
            if current_price <= 0:
                continue

            # Quarter
            hp63 = hist_63.get(symbol, 0)
            if hp63 > 0:
                qc = ((current_price - hp63) / hp63) * 100
                if qc >= 25:
                    up_25_quarter += 1
                elif qc <= -25:
                    down_25_quarter += 1

            # Month
            hp21 = hist_21.get(symbol, 0)
            if hp21 > 0:
                mc = ((current_price - hp21) / hp21) * 100
                if mc >= 25:
                    up_25_month += 1
                elif mc <= -25:
                    down_25_month += 1
                if mc >= 50:
                    up_50_month += 1
                elif mc <= -50:
                    down_50_month += 1

            # 34-day
            hp34 = hist_34.get(symbol, 0)
            if hp34 > 0:
                dc = ((current_price - hp34) / hp34) * 100
                if dc >= 13:
                    up_13_34days += 1
                elif dc <= -13:
                    down_13_34days += 1

        # 5. Calculate T2108 (% above 40-day MA)
        t2108 = None
        prior_dates = get_trading_dates_before(target_date, 40)
        if len(prior_dates) >= 40:
            price_history = {}
            for date in reversed(prior_dates[:40]):
                daily_closes = get_grouped_daily_close(date)
                for sym in universe:
                    if sym in daily_closes:
                        if sym not in price_history:
                            price_history[sym] = []
                        price_history[sym].append(daily_closes[sym])

            above_ma = 0
            total_valid = 0
            for sym in universe:
                if sym not in target_data:
                    continue
                cp = target_data[sym]['close']
                if cp <= 0:
                    continue
                hist = price_history.get(sym, [])
                if len(hist) >= 40:
                    ma40 = sum(hist[-40:]) / 40
                    total_valid += 1
                    if cp > ma40:
                        above_ma += 1

            if total_valid > 0:
                t2108 = round((above_ma / total_valid) * 100, 1)
                debug_info.append(f"T2108: {t2108}% ({above_ma}/{total_valid} above 40d MA)")
        else:
            debug_info.append(f"T2108: skipped (only {len(prior_dates)} prior dates, need 40)")

        # 6. Build response matching the format from breadth/__init__.py
        response = {
            'date': target_date,
            'timestamp': int(datetime.strptime(target_date, '%Y-%m-%d').timestamp() * 1000),
            'universeCount': len(universe),
            'cached': False,
            'marketClosed': True,
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
                'spyChange': spy_change,
                'spyChangePercent': spy_change_pct
            },
            't2108': t2108
        }

        # 7. Save as daily snapshot
        saved = save_daily_snapshot('breadth:realtime', response, date=target_date)
        debug_info.append(f"Snapshot saved: {saved}")

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'date': target_date,
                'data': response,
                'debug': debug_info
            }, indent=2),
            mimetype="application/json"
        )

    except Exception as e:
        import traceback
        return func.HttpResponse(
            json.dumps({
                'error': str(e),
                'traceback': traceback.format_exc()
            }, indent=2),
            status_code=500,
            mimetype="application/json"
        )
