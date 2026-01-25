import json
import os
import logging
import sys
from datetime import datetime, timedelta
import azure.functions as func
import urllib.request
import ssl

# Import shared cache module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_cached, set_cached

POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY', '')
POLYGON_BASE_URL = 'https://api.polygon.io'
CACHE_TTL_ANALYSIS = 5 * 60  # 5 minutes for full analysis

def polygon_request(endpoint: str) -> dict:
    """Make a request to Polygon API"""
    url = f"{POLYGON_BASE_URL}{endpoint}"
    if '?' in url:
        url += f"&apiKey={POLYGON_API_KEY}"
    else:
        url += f"?apiKey={POLYGON_API_KEY}"

    try:
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'SmartStockAnalysis/1.0'})
        with urllib.request.urlopen(req, timeout=30, context=context) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        logging.error(f"Polygon API error for {endpoint}: {e}")
        return {'_error': str(e)}

def get_snapshot(symbol: str) -> dict:
    """Get real-time snapshot data for a symbol."""
    data = polygon_request(f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
    return data.get('ticker', {})

def get_company_details(symbol: str) -> dict:
    """Get company details from Polygon reference API."""
    data = polygon_request(f"/v3/reference/tickers/{symbol}")
    return data.get('results', {})

def get_historical_data(symbol: str) -> dict:
    """Get 52-week high/low and average volume."""
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')

        data = polygon_request(f"/v2/aggs/ticker/{symbol}/range/1/day/{start_date}/{end_date}?limit=365")
        results = data.get('results', [])

        if results:
            highs = [r.get('h', 0) for r in results if r.get('h')]
            lows = [r.get('l', 0) for r in results if r.get('l')]
            volumes = [r.get('v', 0) for r in results if r.get('v')]

            week52_high = max(highs) if highs else 0
            week52_low = min(lows) if lows else 0

            recent_volumes = volumes[-30:] if len(volumes) >= 30 else volumes
            avg_volume = int(sum(recent_volumes) / len(recent_volumes)) if recent_volumes else 0

            return {
                'week52High': week52_high,
                'week52Low': week52_low,
                'avgVolume': avg_volume
            }
    except Exception as e:
        logging.error(f"Error getting historical data for {symbol}: {e}")

    return {'week52High': 0, 'week52Low': 0, 'avgVolume': 0}

def get_financials(symbol: str, statement_type: str, limit: int = 5) -> list:
    """Get financial statements from Polygon."""
    try:
        # Using the vX financials endpoint
        endpoint = f"/vX/reference/financials?ticker={symbol}&limit={limit}&timeframe=quarterly&order=desc"
        data = polygon_request(endpoint)

        if '_error' in data:
            return []

        results = data.get('results', [])
        statements = []

        for result in results:
            financials = result.get('financials', {})

            if statement_type == 'income':
                income = financials.get('income_statement', {})
                if income:
                    statements.append({
                        'period': result.get('fiscal_period', ''),
                        'fiscalYear': result.get('fiscal_year', ''),
                        'revenue': income.get('revenues', {}).get('value', 0),
                        'costOfRevenue': income.get('cost_of_revenue', {}).get('value', 0),
                        'grossProfit': income.get('gross_profit', {}).get('value', 0),
                        'operatingExpense': income.get('operating_expenses', {}).get('value', 0),
                        'operatingIncome': income.get('operating_income_loss', {}).get('value', 0),
                        'netIncome': income.get('net_income_loss', {}).get('value', 0),
                        'eps': income.get('basic_earnings_per_share', {}).get('value', 0),
                        'ebitda': income.get('ebitda', {}).get('value', 0)
                    })

            elif statement_type == 'balance':
                balance = financials.get('balance_sheet', {})
                if balance:
                    statements.append({
                        'period': result.get('fiscal_period', ''),
                        'fiscalYear': result.get('fiscal_year', ''),
                        'cash': balance.get('cash', {}).get('value', 0),
                        'totalAssets': balance.get('assets', {}).get('value', 0),
                        'totalLiabilities': balance.get('liabilities', {}).get('value', 0),
                        'totalEquity': balance.get('equity', {}).get('value', 0),
                        'currentAssets': balance.get('current_assets', {}).get('value', 0),
                        'currentLiabilities': balance.get('current_liabilities', {}).get('value', 0)
                    })

            elif statement_type == 'cashflow':
                cf = financials.get('cash_flow_statement', {})
                if cf:
                    operating = cf.get('net_cash_flow_from_operating_activities', {}).get('value', 0)
                    investing = cf.get('net_cash_flow_from_investing_activities', {}).get('value', 0)
                    net_income = financials.get('income_statement', {}).get('net_income_loss', {}).get('value', 0)

                    # Free cash flow = Operating cash flow - CapEx
                    capex = abs(cf.get('capital_expenditure', {}).get('value', 0))
                    free_cash_flow = operating - capex if operating else 0

                    statements.append({
                        'period': result.get('fiscal_period', ''),
                        'fiscalYear': result.get('fiscal_year', ''),
                        'netIncome': net_income,
                        'operatingCashFlow': operating,
                        'investingCashFlow': investing,
                        'financingCashFlow': cf.get('net_cash_flow_from_financing_activities', {}).get('value', 0),
                        'freeCashFlow': free_cash_flow
                    })

        return statements
    except Exception as e:
        logging.error(f"Error getting {statement_type} statements for {symbol}: {e}")
        return []

def get_dividends(symbol: str, limit: int = 10) -> list:
    """Get dividend history from Polygon."""
    try:
        data = polygon_request(f"/v3/reference/dividends?ticker={symbol}&limit={limit}&order=desc")

        if '_error' in data:
            return []

        results = data.get('results', [])
        dividends = []

        for div in results:
            dividends.append({
                'exDate': div.get('ex_dividend_date', ''),
                'payDate': div.get('pay_date', ''),
                'amount': div.get('cash_amount', 0),
                'frequency': div.get('frequency', 0)
            })

        return dividends
    except Exception as e:
        logging.error(f"Error getting dividends for {symbol}: {e}")
        return []

def calculate_ratios(income_statements: list, balance_sheets: list, market_cap: float, current_price: float) -> dict:
    """Calculate financial ratios from statements."""
    ratios = {
        'peRatio': None,
        'pbRatio': None,
        'psRatio': None,
        'roe': None,
        'roa': None,
        'debtToEquity': None
    }

    try:
        # Get most recent statements
        if income_statements and len(income_statements) > 0:
            recent_income = income_statements[0]

            # Calculate trailing 12 month EPS (sum of last 4 quarters if available)
            ttm_eps = sum(stmt.get('eps', 0) for stmt in income_statements[:4])
            if ttm_eps and ttm_eps != 0 and current_price:
                ratios['peRatio'] = round(current_price / ttm_eps, 2)

            # P/S ratio
            ttm_revenue = sum(stmt.get('revenue', 0) for stmt in income_statements[:4])
            if ttm_revenue and market_cap:
                ratios['psRatio'] = round(market_cap / ttm_revenue, 2)

        if balance_sheets and len(balance_sheets) > 0:
            recent_balance = balance_sheets[0]

            total_equity = recent_balance.get('totalEquity', 0)
            total_assets = recent_balance.get('totalAssets', 0)
            total_liabilities = recent_balance.get('totalLiabilities', 0)

            # P/B ratio
            if total_equity and total_equity > 0 and market_cap:
                ratios['pbRatio'] = round(market_cap / total_equity, 2)

            # Debt to Equity
            if total_equity and total_equity != 0:
                ratios['debtToEquity'] = round(total_liabilities / total_equity, 2)

            # ROE and ROA (using TTM net income)
            if income_statements:
                ttm_net_income = sum(stmt.get('netIncome', 0) for stmt in income_statements[:4])

                if total_equity and total_equity != 0:
                    ratios['roe'] = round((ttm_net_income / total_equity) * 100, 2)

                if total_assets and total_assets != 0:
                    ratios['roa'] = round((ttm_net_income / total_assets) * 100, 2)

    except Exception as e:
        logging.error(f"Error calculating ratios: {e}")

    return ratios

def main(req: func.HttpRequest) -> func.HttpResponse:
    """Get comprehensive stock analysis data for a symbol."""
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

        # Check for refresh parameter
        refresh = req.params.get('refresh', '').lower() == 'true'

        # Create cache key for this symbol
        cache_key = f"analysis:{symbol}"

        # Check cache first (unless refresh requested)
        if not refresh:
            cached_data = get_cached(cache_key)
            if cached_data:
                logging.info(f"Cache hit for analysis: {symbol}")
                cached_data['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached_data),
                    mimetype="application/json"
                )

        logging.info(f"Cache miss for analysis: {symbol}, fetching data...")

        # Get snapshot data
        snapshot = get_snapshot(symbol)
        if not snapshot:
            return func.HttpResponse(
                json.dumps({'error': f'No data found for symbol: {symbol}'}),
                status_code=404,
                mimetype="application/json"
            )

        # Get company details
        details = get_company_details(symbol)

        # Get historical data (52-week high/low, avg volume)
        historical = get_historical_data(symbol)

        # Get financial statements
        income_statements = get_financials(symbol, 'income')
        balance_sheets = get_financials(symbol, 'balance')
        cash_flows = get_financials(symbol, 'cashflow')

        # Get dividends
        dividends = get_dividends(symbol)

        # Extract price data from snapshot
        day = snapshot.get('day', {})
        prev_day = snapshot.get('prevDay', {})
        last_trade = snapshot.get('lastTrade', {})
        min_data = snapshot.get('min', {})

        current_price = last_trade.get('p') or day.get('c') or min_data.get('c') or 0
        market_cap = details.get('market_cap', 0)

        # Calculate ratios
        ratios = calculate_ratios(income_statements, balance_sheets, market_cap, current_price)

        # Calculate dividend yield
        dividend_yield = None
        if dividends and current_price > 0:
            # Annualize based on frequency (4 = quarterly, 12 = monthly, etc.)
            recent_div = dividends[0]
            freq = recent_div.get('frequency', 4)
            annual_div = recent_div.get('amount', 0) * freq
            if annual_div > 0:
                dividend_yield = round((annual_div / current_price) * 100, 2)

        result = {
            # Basic Info
            'symbol': symbol,
            'name': details.get('name', symbol),
            'description': details.get('description', ''),
            'exchange': details.get('primary_exchange', ''),
            'sector': details.get('sic_description', ''),
            'industry': details.get('sic_description', ''),
            'employees': details.get('total_employees', 0),
            'website': details.get('homepage_url', ''),

            # Quote Data
            'last': current_price,
            'change': snapshot.get('todaysChange', 0),
            'changePercent': snapshot.get('todaysChangePerc', 0),
            'open': day.get('o', 0),
            'high': day.get('h', 0),
            'low': day.get('l', 0),
            'volume': day.get('v', 0),
            'avgVolume': historical.get('avgVolume', 0),
            'marketCap': market_cap,
            'week52High': historical.get('week52High', 0),
            'week52Low': historical.get('week52Low', 0),

            # Financial Statements
            'incomeStatements': income_statements,
            'balanceSheets': balance_sheets,
            'cashFlows': cash_flows,

            # Ratios
            'peRatio': ratios.get('peRatio'),
            'pbRatio': ratios.get('pbRatio'),
            'psRatio': ratios.get('psRatio'),
            'roe': ratios.get('roe'),
            'roa': ratios.get('roa'),
            'debtToEquity': ratios.get('debtToEquity'),

            # Dividends
            'dividends': dividends,
            'dividendYield': dividend_yield,

            # Metadata
            'timestamp': datetime.now().isoformat(),
            'cached': False
        }

        # Cache the result
        set_cached(cache_key, result, CACHE_TTL_ANALYSIS)
        logging.info(f"Cached analysis data for {symbol}")

        return func.HttpResponse(
            json.dumps(result),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in analysis endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
