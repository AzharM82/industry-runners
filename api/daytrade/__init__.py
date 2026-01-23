import json
import os
import logging
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'

# ETF groups with expanded holdings for day trading
ETF_GROUPS = {
    'SMH': {
        'name': 'Semiconductors',
        'holdings': ['NVDA', 'AMD', 'MU', 'INTC', 'AMAT', 'LRCX', 'KLAC', 'ON', 'MRVL', 'QCOM', 'TXN', 'SWKS', 'MPWR', 'ADI', 'NXPI', 'WOLF', 'SLAB', 'DIOD', 'ACLS', 'COHU', 'FORM', 'POWI', 'SMTC', 'AMBA', 'CRUS', 'RMBS', 'SYNA', 'SITM', 'AOSL', 'INDI']
    },
    'FDN': {
        'name': 'Internet',
        'holdings': ['META', 'GOOGL', 'NFLX', 'SNAP', 'PINS', 'ETSY', 'ZM', 'DBX', 'FVRR', 'UPWK', 'DOCS', 'OPEN', 'COUR', 'RSKD', 'DV', 'SEMR', 'YOU', 'AGYS', 'MGNI', 'PUBM', 'CRTO', 'QNST', 'APPS', 'BMBL', 'MTCH', 'IAC', 'ANGI', 'YELP', 'GRPN', 'TRIP']
    },
    'IGV': {
        'name': 'Software',
        'holdings': ['CRM', 'ADBE', 'NOW', 'PLTR', 'DDOG', 'TEAM', 'HUBS', 'TTD', 'PATH', 'ZI', 'APPN', 'ESTC', 'GTLB', 'NEWR', 'DT', 'FRSH', 'PD', 'DOCN', 'SUMO', 'BRZE', 'MNDY', 'CFLT', 'SNOW', 'MDB', 'CLSK', 'BILL', 'PCOR', 'ALTR', 'BOX', 'SQSP']
    },
    'CIBR': {
        'name': 'Cybersecurity',
        'holdings': ['CRWD', 'PANW', 'FTNT', 'ZS', 'OKTA', 'S', 'CYBR', 'QLYS', 'TENB', 'RPD', 'VRNS', 'RDWR', 'SAIL', 'SCWX', 'EVBG', 'OSPN', 'SSTI', 'CLSK', 'RIOT', 'MARA']
    },
    'BLOK': {
        'name': 'Blockchain/Crypto',
        'holdings': ['COIN', 'MARA', 'RIOT', 'CLSK', 'CIFR', 'HUT', 'BTBT', 'BITF', 'HIVE', 'MSTR', 'HOOD', 'SQ', 'SI', 'OSTK', 'GREE', 'WULF', 'IREN', 'CORZ', 'BTDR', 'ARBK']
    },
    'ROBO': {
        'name': 'Robotics & AI',
        'holdings': ['PATH', 'AI', 'UPST', 'ISRG', 'TER', 'IRBT', 'CGNX', 'BRKS', 'NNDM', 'OUST', 'LAZR', 'AEVA', 'LIDR', 'INVZ', 'PRCT', 'RBOT', 'AVAV', 'KTOS', 'RDW', 'AMBA']
    },
    'XLE': {
        'name': 'Energy',
        'holdings': ['XOM', 'CVX', 'COP', 'OXY', 'DVN', 'FANG', 'MRO', 'APA', 'MTDR', 'CHRD', 'PR', 'SM', 'NOG', 'VTLE', 'AR', 'RRC', 'SWN', 'CNX', 'CTRA', 'GPOR', 'NEXT', 'ARIS', 'PUMP', 'LBRT', 'NEX', 'HP', 'PTEN', 'WHD', 'OII', 'RIG']
    },
    'TAN': {
        'name': 'Solar',
        'holdings': ['FSLR', 'ENPH', 'RUN', 'SEDG', 'ARRY', 'NOVA', 'MAXN', 'CSIQ', 'JKS', 'SHLS', 'BE', 'BEEM', 'SOL', 'SPWR', 'DQ', 'FLNC', 'HASI', 'STEM', 'PLUG', 'BLNK']
    },
    'XME': {
        'name': 'Metals & Mining',
        'holdings': ['AA', 'FCX', 'CLF', 'X', 'NUE', 'STLD', 'CMC', 'CDE', 'HL', 'PAAS', 'MAG', 'EXK', 'FSM', 'AG', 'SVM', 'USAS', 'SILV', 'GATO', 'GPL', 'ASM']
    },
    'GDX': {
        'name': 'Gold Miners',
        'holdings': ['NEM', 'GOLD', 'AEM', 'KGC', 'AU', 'AGI', 'BTG', 'EGO', 'IAG', 'HMY', 'CDE', 'HL', 'PAAS', 'MAG', 'EXK', 'FSM', 'AG', 'NGD', 'SSRM', 'OR']
    },
    'XBI': {
        'name': 'Biotech',
        'holdings': ['MRNA', 'BNTX', 'VRTX', 'REGN', 'BIIB', 'ALNY', 'SRPT', 'BMRN', 'EXEL', 'HALO', 'FOLD', 'KRYS', 'PRAX', 'RVMD', 'ROIV', 'ARWR', 'IONS', 'RARE', 'BLUE', 'SGEN', 'NVAX', 'GILD', 'ABBV', 'AMGN', 'INO', 'VIR', 'OCGN', 'SAVA', 'IMVT', 'FULC']
    },
    'MSOS': {
        'name': 'Cannabis',
        'holdings': ['TLRY', 'CGC', 'ACB', 'SNDL', 'OGI', 'CRON', 'GRWG', 'VFF', 'MAPS', 'IIPR', 'AAWH', 'GTII', 'CURA', 'TRUL', 'HRVSF', 'TCNNF', 'CURLF', 'GLASF', 'CRLBF', 'VRNOF']
    },
    'XRT': {
        'name': 'Retail',
        'holdings': ['GME', 'BBBY', 'M', 'JWN', 'KSS', 'GPS', 'ANF', 'AEO', 'EXPR', 'TLYS', 'CATO', 'SCVL', 'BOOT', 'BKE', 'FIVE', 'DKS', 'HIBB', 'PLCE', 'CAL', 'GCO', 'CHS', 'LE', 'ZUMZ', 'CURV', 'REAL', 'PRTY', 'CTRN', 'WISH', 'SFIX', 'RENT']
    },
    'ITA': {
        'name': 'Aerospace & Defense',
        'holdings': ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'AXON', 'TDG', 'KTOS', 'AVAV', 'RKLB', 'LUNR', 'RDW', 'SPCE', 'ASTR', 'PL', 'ASTS', 'BKSY', 'MNTS', 'VORB']
    },
    'IYT': {
        'name': 'Transportation',
        'holdings': ['UPS', 'FDX', 'ODFL', 'XPO', 'SAIA', 'WERN', 'LSTR', 'SNDR', 'CHRW', 'JBHT', 'KNX', 'ARCB', 'HTLD', 'MRTN', 'CVLG', 'HUBG', 'GXO', 'FWRD', 'YELL', 'USAK']
    }
}

def polygon_request(endpoint: str) -> dict:
    """Make a request to Polygon API"""
    url = f"{POLYGON_BASE_URL}{endpoint}"
    if '?' in url:
        url += f"&apiKey={POLYGON_API_KEY}"
    else:
        url += f"?apiKey={POLYGON_API_KEY}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {}

def get_historical_data(symbol: str, days: int = 60) -> list:
    """Get historical daily OHLCV data for a symbol."""
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=days + 30)).strftime('%Y-%m-%d')

        data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?adjusted=true&sort=asc&limit={days + 20}")
        return data.get('results', [])
    except Exception as e:
        logging.error(f"Error fetching historical data for {symbol}: {e}")
    return []

def calculate_atr(bars: list, period: int = 14) -> float:
    """Calculate Average True Range over the specified period."""
    if len(bars) < period + 1:
        return 0

    true_ranges = []
    for i in range(1, len(bars)):
        high = bars[i].get('h', 0)
        low = bars[i].get('l', 0)
        prev_close = bars[i-1].get('c', 0)

        if high == 0 or low == 0 or prev_close == 0:
            continue

        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return 0

    recent_trs = true_ranges[-period:]
    return sum(recent_trs) / len(recent_trs)

def calculate_avg_volume(bars: list, period: int = 50) -> float:
    """Calculate average volume over the specified period."""
    if len(bars) < period:
        return 0

    volumes = [bar.get('v', 0) for bar in bars[-period:] if bar.get('v', 0) > 0]
    if not volumes:
        return 0

    return sum(volumes) / len(volumes)

def get_current_price(symbol: str) -> dict:
    """Get current snapshot data for a symbol."""
    try:
        data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
        ticker = data.get('ticker', {})
        day = ticker.get('day', {})
        prev_day = ticker.get('prevDay', {})
        last_trade = ticker.get('lastTrade', {})

        current_price = last_trade.get('p') or day.get('c') or 0
        open_price = day.get('o', 0)
        prev_close = prev_day.get('c', 0)

        change_from_open_pct = ((current_price - open_price) / open_price * 100) if open_price > 0 else 0
        change_pct = ((current_price - prev_close) / prev_close * 100) if prev_close > 0 else 0

        return {
            'last': current_price,
            'open': open_price,
            'high': day.get('h', 0),
            'low': day.get('l', 0),
            'volume': day.get('v', 0),
            'changePercent': round(change_pct, 2),
            'changeFromOpenPercent': round(change_from_open_pct, 2),
        }
    except Exception as e:
        logging.error(f"Error getting current price for {symbol}: {e}")
    return {}

def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        excluded_param = req.params.get('excluded', '')
        excluded_symbols = set(s.strip().upper() for s in excluded_param.split(',') if s.strip())

        if not POLYGON_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'Polygon API key not configured'}),
                status_code=500,
                mimetype="application/json"
            )

        results = {}
        global_used_symbols = set(excluded_symbols)

        for etf_symbol, etf_info in ETF_GROUPS.items():
            etf_stocks = []

            for symbol in etf_info['holdings']:
                if symbol in global_used_symbols:
                    continue

                try:
                    bars = get_historical_data(symbol, 60)
                    if len(bars) < 20:
                        continue

                    current = get_current_price(symbol)
                    if not current or not current.get('last'):
                        continue

                    price = current['last']

                    # Filter: Price between $1 and $30
                    if price < 1 or price > 30:
                        continue

                    avg_volume = calculate_avg_volume(bars, 50)

                    # Filter: Average volume > 500k
                    if avg_volume < 500000:
                        continue

                    atr = calculate_atr(bars, 14)
                    if atr <= 0:
                        continue

                    atr_percent = (atr / price) * 100

                    etf_stocks.append({
                        'symbol': symbol,
                        'name': symbol,
                        'last': round(price, 2),
                        'atr': round(atr, 2),
                        'atrPercent': round(atr_percent, 2),
                        'avgVolume': round(avg_volume, 0),
                        'volume': current.get('volume', 0),
                        'changePercent': current.get('changePercent', 0),
                        'changeFromOpenPercent': current.get('changeFromOpenPercent', 0),
                        'high': current.get('high', 0),
                        'low': current.get('low', 0),
                        'open': current.get('open', 0),
                    })

                except Exception as e:
                    logging.error(f"Error processing {symbol}: {e}")
                    continue

            # Sort by ATR (highest first) and take top 10
            etf_stocks.sort(key=lambda x: x['atr'], reverse=True)
            top_stocks = etf_stocks[:10]

            for stock in top_stocks:
                global_used_symbols.add(stock['symbol'])

            results[etf_symbol] = {
                'name': etf_info['name'],
                'stocks': top_stocks
            }

        return func.HttpResponse(
            json.dumps({
                'groups': results,
                'excludedCount': len(excluded_symbols),
                'timestamp': datetime.now().isoformat()
            }),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in daytrade endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
