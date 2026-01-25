"""
Run Prompt API - Execute AI prompts with caching
"""

import json
import os
import base64
import logging
from datetime import datetime, timedelta
import azure.functions as func
import anthropic
import redis
import requests

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    get_subscription,
    get_usage_count,
    record_usage,
    init_schema
)
from shared.admin import is_admin, get_monthly_limit

# Initialize clients
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
REDIS_URL = os.environ.get('REDIS_CONNECTION_STRING')
POLYGON_API_KEY = os.environ.get('POLYGON_API_KEY')


def fetch_polygon_market_data(ticker: str) -> dict:
    """Fetch comprehensive market data from Polygon API for Deep Research analysis."""
    if not POLYGON_API_KEY:
        logging.warning("POLYGON_API_KEY not configured")
        return {}

    market_data = {}

    try:
        # 1. Get current snapshot (price, volume, change)
        snapshot_url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}?apiKey={POLYGON_API_KEY}"
        snapshot_resp = requests.get(snapshot_url, timeout=10)
        if snapshot_resp.status_code == 200:
            snapshot = snapshot_resp.json().get('ticker', {})
            if snapshot:
                market_data['current_price'] = snapshot.get('day', {}).get('c') or snapshot.get('prevDay', {}).get('c')
                market_data['open'] = snapshot.get('day', {}).get('o')
                market_data['high'] = snapshot.get('day', {}).get('h')
                market_data['low'] = snapshot.get('day', {}).get('l')
                market_data['volume'] = snapshot.get('day', {}).get('v')
                market_data['prev_close'] = snapshot.get('prevDay', {}).get('c')
                market_data['change'] = snapshot.get('todaysChange')
                market_data['change_percent'] = snapshot.get('todaysChangePerc')

        # 2. Get ticker details (market cap, shares outstanding, description)
        details_url = f"https://api.polygon.io/v3/reference/tickers/{ticker}?apiKey={POLYGON_API_KEY}"
        details_resp = requests.get(details_url, timeout=10)
        if details_resp.status_code == 200:
            details = details_resp.json().get('results', {})
            if details:
                market_data['company_name'] = details.get('name')
                market_data['market_cap'] = details.get('market_cap')
                market_data['shares_outstanding'] = details.get('share_class_shares_outstanding')
                market_data['description'] = details.get('description', '')[:500]  # Truncate long descriptions
                market_data['sector'] = details.get('sic_description')
                market_data['homepage'] = details.get('homepage_url')
                market_data['total_employees'] = details.get('total_employees')

        # 3. Get 52-week high/low from aggregates
        end_date = datetime.now()
        start_date = end_date - timedelta(days=365)
        aggs_url = f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start_date.strftime('%Y-%m-%d')}/{end_date.strftime('%Y-%m-%d')}?adjusted=true&sort=asc&apiKey={POLYGON_API_KEY}"
        aggs_resp = requests.get(aggs_url, timeout=15)
        if aggs_resp.status_code == 200:
            results = aggs_resp.json().get('results', [])
            if results:
                closes = [r.get('c') for r in results if r.get('c')]
                highs = [r.get('h') for r in results if r.get('h')]
                lows = [r.get('l') for r in results if r.get('l')]
                if closes:
                    market_data['week_52_high'] = max(highs) if highs else None
                    market_data['week_52_low'] = min(lows) if lows else None
                    # Calculate price performance
                    if len(closes) > 0:
                        market_data['ytd_return'] = ((closes[-1] - closes[0]) / closes[0] * 100) if closes[0] else None
                    # Get prices at different intervals for context
                    if len(closes) >= 252:
                        market_data['price_1yr_ago'] = closes[0]
                    if len(closes) >= 126:
                        market_data['price_6mo_ago'] = closes[-126]
                    if len(closes) >= 63:
                        market_data['price_3mo_ago'] = closes[-63]
                    if len(closes) >= 21:
                        market_data['price_1mo_ago'] = closes[-21]

        # 4. Get financials (basic metrics)
        financials_url = f"https://api.polygon.io/vX/reference/financials?ticker={ticker}&limit=4&apiKey={POLYGON_API_KEY}"
        fin_resp = requests.get(financials_url, timeout=10)
        if fin_resp.status_code == 200:
            fin_results = fin_resp.json().get('results', [])
            if fin_results:
                latest = fin_results[0]
                financials = latest.get('financials', {})

                # Income statement
                income = financials.get('income_statement', {})
                market_data['revenue'] = income.get('revenues', {}).get('value')
                market_data['net_income'] = income.get('net_income_loss', {}).get('value')
                market_data['gross_profit'] = income.get('gross_profit', {}).get('value')
                market_data['operating_income'] = income.get('operating_income_loss', {}).get('value')
                market_data['eps_diluted'] = income.get('diluted_earnings_per_share', {}).get('value')

                # Balance sheet
                balance = financials.get('balance_sheet', {})
                market_data['total_assets'] = balance.get('assets', {}).get('value')
                market_data['total_liabilities'] = balance.get('liabilities', {}).get('value')
                market_data['total_equity'] = balance.get('equity', {}).get('value')
                market_data['cash'] = balance.get('cash', {}).get('value')
                market_data['total_debt'] = balance.get('long_term_debt', {}).get('value')

                # Cash flow
                cashflow = financials.get('cash_flow_statement', {})
                market_data['operating_cash_flow'] = cashflow.get('net_cash_flow_from_operating_activities', {}).get('value')
                market_data['free_cash_flow'] = cashflow.get('free_cash_flow', {}).get('value')

                market_data['fiscal_period'] = latest.get('fiscal_period')
                market_data['fiscal_year'] = latest.get('fiscal_year')

        # Calculate valuation ratios if we have the data
        if market_data.get('current_price') and market_data.get('eps_diluted') and market_data['eps_diluted'] != 0:
            market_data['pe_ratio'] = round(market_data['current_price'] / market_data['eps_diluted'], 2)

        if market_data.get('market_cap') and market_data.get('revenue') and market_data['revenue'] != 0:
            market_data['ps_ratio'] = round(market_data['market_cap'] / market_data['revenue'], 2)

        if market_data.get('market_cap') and market_data.get('total_equity') and market_data['total_equity'] != 0:
            market_data['pb_ratio'] = round(market_data['market_cap'] / market_data['total_equity'], 2)

        logging.info(f"Fetched market data for {ticker}: {len(market_data)} fields")

    except Exception as e:
        logging.error(f"Error fetching Polygon data for {ticker}: {e}")

    return market_data


def format_market_data_for_prompt(ticker: str, data: dict) -> str:
    """Format market data as a structured string for the AI prompt."""
    if not data:
        return f"Note: Unable to fetch real-time market data for {ticker}. Please use your knowledge to provide estimates."

    def fmt_num(val, prefix='$', suffix='', decimals=2):
        if val is None:
            return 'N/A'
        if abs(val) >= 1e12:
            return f"{prefix}{val/1e12:.{decimals}f}T{suffix}"
        if abs(val) >= 1e9:
            return f"{prefix}{val/1e9:.{decimals}f}B{suffix}"
        if abs(val) >= 1e6:
            return f"{prefix}{val/1e6:.{decimals}f}M{suffix}"
        return f"{prefix}{val:,.{decimals}f}{suffix}"

    lines = [
        f"=== REAL-TIME MARKET DATA FOR {ticker} (as of {datetime.now().strftime('%Y-%m-%d')}) ===",
        ""
    ]

    # Company info
    if data.get('company_name'):
        lines.append(f"Company: {data['company_name']}")
    if data.get('sector'):
        lines.append(f"Sector: {data['sector']}")
    if data.get('total_employees'):
        lines.append(f"Employees: {data['total_employees']:,}")

    lines.append("")
    lines.append("--- PRICE DATA ---")
    if data.get('current_price'):
        lines.append(f"Current Price: ${data['current_price']:.2f}")
    if data.get('change') is not None and data.get('change_percent') is not None:
        sign = '+' if data['change'] >= 0 else ''
        lines.append(f"Today's Change: {sign}${data['change']:.2f} ({sign}{data['change_percent']:.2f}%)")
    if data.get('week_52_high') and data.get('week_52_low'):
        lines.append(f"52-Week Range: ${data['week_52_low']:.2f} - ${data['week_52_high']:.2f}")

    # Price performance
    if data.get('current_price'):
        lines.append("")
        lines.append("--- PRICE PERFORMANCE ---")
        if data.get('price_1mo_ago'):
            pct = (data['current_price'] - data['price_1mo_ago']) / data['price_1mo_ago'] * 100
            lines.append(f"1-Month Return: {pct:+.1f}%")
        if data.get('price_3mo_ago'):
            pct = (data['current_price'] - data['price_3mo_ago']) / data['price_3mo_ago'] * 100
            lines.append(f"3-Month Return: {pct:+.1f}%")
        if data.get('price_6mo_ago'):
            pct = (data['current_price'] - data['price_6mo_ago']) / data['price_6mo_ago'] * 100
            lines.append(f"6-Month Return: {pct:+.1f}%")
        if data.get('price_1yr_ago'):
            pct = (data['current_price'] - data['price_1yr_ago']) / data['price_1yr_ago'] * 100
            lines.append(f"1-Year Return: {pct:+.1f}%")

    lines.append("")
    lines.append("--- VALUATION ---")
    if data.get('market_cap'):
        lines.append(f"Market Cap: {fmt_num(data['market_cap'])}")
    if data.get('pe_ratio'):
        lines.append(f"P/E Ratio: {data['pe_ratio']:.1f}x")
    if data.get('ps_ratio'):
        lines.append(f"P/S Ratio: {data['ps_ratio']:.1f}x")
    if data.get('pb_ratio'):
        lines.append(f"P/B Ratio: {data['pb_ratio']:.1f}x")

    lines.append("")
    lines.append("--- FINANCIALS (Most Recent Quarter) ---")
    if data.get('fiscal_period') and data.get('fiscal_year'):
        lines.append(f"Period: {data['fiscal_period']} {data['fiscal_year']}")
    if data.get('revenue'):
        lines.append(f"Revenue: {fmt_num(data['revenue'])}")
    if data.get('gross_profit'):
        lines.append(f"Gross Profit: {fmt_num(data['gross_profit'])}")
        if data.get('revenue'):
            margin = data['gross_profit'] / data['revenue'] * 100
            lines.append(f"Gross Margin: {margin:.1f}%")
    if data.get('operating_income'):
        lines.append(f"Operating Income: {fmt_num(data['operating_income'])}")
        if data.get('revenue'):
            margin = data['operating_income'] / data['revenue'] * 100
            lines.append(f"Operating Margin: {margin:.1f}%")
    if data.get('net_income'):
        lines.append(f"Net Income: {fmt_num(data['net_income'])}")
        if data.get('revenue'):
            margin = data['net_income'] / data['revenue'] * 100
            lines.append(f"Net Margin: {margin:.1f}%")
    if data.get('eps_diluted'):
        lines.append(f"EPS (Diluted): ${data['eps_diluted']:.2f}")

    lines.append("")
    lines.append("--- BALANCE SHEET ---")
    if data.get('cash'):
        lines.append(f"Cash & Equivalents: {fmt_num(data['cash'])}")
    if data.get('total_debt'):
        lines.append(f"Total Debt: {fmt_num(data['total_debt'])}")
    if data.get('total_assets'):
        lines.append(f"Total Assets: {fmt_num(data['total_assets'])}")
    if data.get('total_equity'):
        lines.append(f"Total Equity: {fmt_num(data['total_equity'])}")

    lines.append("")
    lines.append("--- CASH FLOW ---")
    if data.get('operating_cash_flow'):
        lines.append(f"Operating Cash Flow: {fmt_num(data['operating_cash_flow'])}")
    if data.get('free_cash_flow'):
        lines.append(f"Free Cash Flow: {fmt_num(data['free_cash_flow'])}")

    lines.append("")
    lines.append("=" * 60)
    lines.append("")
    lines.append("Use this data to provide specific price targets and valuation analysis.")

    return "\n".join(lines)

# Prompt files content (loaded at startup)
PROMPTS = {}

def load_prompts():
    """Load prompt files."""
    global PROMPTS
    prompt_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'prompts')

    prompt_files = {
        'chartgpt': 'ChartGPT.txt',
        'deep-research': 'Deep Research Analysis.txt',
        'halal': 'Halal Stock Analysis.txt'
    }

    for key, filename in prompt_files.items():
        filepath = os.path.join(prompt_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                PROMPTS[key] = f.read()
        except Exception as e:
            logging.warning(f"Could not load prompt {filename}: {e}")
            # Fallback prompts
            if key == 'chartgpt':
                PROMPTS[key] = "You are ChartGPT, an expert chart pattern analyst. Analyze the given stock."
            elif key == 'deep-research':
                PROMPTS[key] = "You are an equity research analyst. Provide a comprehensive 13-point analysis of the given stock."
            elif key == 'halal':
                PROMPTS[key] = "You are a Shariah compliance analyst. Check if the given stock is halal according to AAOIFI standards."

load_prompts()


def get_redis_client():
    """Get Redis client if configured."""
    if not REDIS_URL:
        return None
    try:
        # Parse Azure Redis connection string
        if ',' in REDIS_URL:
            parts = dict(p.split('=', 1) for p in REDIS_URL.split(',') if '=' in p)
            host_port = REDIS_URL.split(',')[0]
            host, port = host_port.rsplit(':', 1)
            password = parts.get('password', '')
            ssl = parts.get('ssl', 'True').lower() == 'true'
            return redis.Redis(host=host, port=int(port), password=password, ssl=ssl)
        else:
            return redis.from_url(REDIS_URL)
    except Exception as e:
        logging.error(f"Could not connect to Redis: {e}")
        return None


def get_user_from_auth(req):
    """Extract user info from Azure Static Web Apps auth header."""
    client_principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not client_principal:
        return None
    try:
        decoded = base64.b64decode(client_principal)
        return json.loads(decoded)
    except:
        return None


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Initialize schema
        init_schema()

        # Get authenticated user
        auth_user = get_user_from_auth(req)
        if not auth_user:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized'}),
                status_code=401,
                mimetype='application/json'
            )

        user_email = auth_user.get('userDetails', '').lower()

        # Parse request body
        try:
            body = req.get_json()
        except:
            return func.HttpResponse(
                json.dumps({'error': 'Invalid JSON body'}),
                status_code=400,
                mimetype='application/json'
            )

        prompt_type = body.get('prompt_type', '').lower()
        ticker = body.get('ticker', '').upper().strip()
        image_data = body.get('image', None)  # Base64 data URL for chart images

        # Validate prompt type
        if prompt_type not in PROMPTS:
            return func.HttpResponse(
                json.dumps({'error': f'Invalid prompt type. Must be: chartgpt, deep-research, halal'}),
                status_code=400,
                mimetype='application/json'
            )

        # Validate ticker
        if not ticker or len(ticker) > 10:
            return func.HttpResponse(
                json.dumps({'error': 'Invalid ticker symbol'}),
                status_code=400,
                mimetype='application/json'
            )

        # ChartGPT requires an image
        if prompt_type == 'chartgpt' and not image_data:
            return func.HttpResponse(
                json.dumps({'error': 'ChartGPT requires a chart image. Please upload a chart.'}),
                status_code=400,
                mimetype='application/json'
            )

        # Validate image format if provided
        has_image = False
        image_media_type = None
        image_base64 = None
        if image_data:
            if not image_data.startswith('data:image/'):
                return func.HttpResponse(
                    json.dumps({'error': 'Invalid image format. Must be a valid image data URL.'}),
                    status_code=400,
                    mimetype='application/json'
                )
            # Extract media type and base64 data
            try:
                header, image_base64 = image_data.split(',', 1)
                image_media_type = header.split(':')[1].split(';')[0]
                has_image = True
            except:
                return func.HttpResponse(
                    json.dumps({'error': 'Failed to parse image data.'}),
                    status_code=400,
                    mimetype='application/json'
                )

        # Check access
        admin = is_admin(user_email)
        monthly_limit = get_monthly_limit(user_email)
        month_year = datetime.now().strftime('%Y-%m')

        if not admin:
            # Get user from database
            user = get_user_by_email(user_email)
            if not user:
                return func.HttpResponse(
                    json.dumps({
                        'error': 'No subscription found',
                        'code': 'NO_SUBSCRIPTION'
                    }),
                    status_code=403,
                    mimetype='application/json'
                )

            # Check subscription
            subscription = get_subscription(str(user['id']))
            if not subscription:
                return func.HttpResponse(
                    json.dumps({
                        'error': 'Active subscription required',
                        'code': 'NO_SUBSCRIPTION'
                    }),
                    status_code=403,
                    mimetype='application/json'
                )

            user_id = str(user['id'])
        else:
            # Admin user - create/get user record
            from shared.database import get_or_create_user
            user = get_or_create_user(user_email, user_email.split('@')[0])
            user_id = str(user['id'])

        # Check usage limit
        usage_count = get_usage_count(user_id, prompt_type, month_year)
        if usage_count >= monthly_limit:
            return func.HttpResponse(
                json.dumps({
                    'error': f'Monthly limit reached ({monthly_limit} prompts)',
                    'code': 'LIMIT_REACHED',
                    'usage': usage_count,
                    'limit': monthly_limit
                }),
                status_code=429,
                mimetype='application/json'
            )

        # Check cache
        today = datetime.now().strftime('%Y-%m-%d')
        cache_key = f"prompt:{prompt_type}:{ticker}:{today}"
        cached_result = None
        redis_client = get_redis_client()

        # Skip cache for: images (unique charts), or admin force refresh
        force_refresh = body.get('force_refresh', False) and admin
        skip_cache = has_image or force_refresh

        if force_refresh:
            logging.info(f"Admin force refresh for {cache_key}")

        # Only use cache for cacheable requests
        if redis_client and not skip_cache:
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    cached_result = cached.decode('utf-8')
                    logging.info(f"Cache hit for {cache_key}")
            except Exception as e:
                logging.warning(f"Redis get error: {e}")

        if cached_result:
            # Record usage (cache hit)
            record_usage(user_id, prompt_type, ticker, month_year, cached=True)

            return func.HttpResponse(
                json.dumps({
                    'result': cached_result,
                    'cached': True,
                    'ticker': ticker,
                    'prompt_type': prompt_type,
                    'usage': {
                        'used': usage_count + 1,
                        'limit': monthly_limit
                    }
                }),
                mimetype='application/json'
            )

        # Call Claude API
        if not ANTHROPIC_API_KEY:
            return func.HttpResponse(
                json.dumps({'error': 'AI service not configured'}),
                status_code=500,
                mimetype='application/json'
            )

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        system_prompt = PROMPTS[prompt_type]

        # Build user message based on prompt type
        if prompt_type == 'chartgpt':
            user_text = f"CHARTGPT: Analyze this chart for {ticker}. Provide a comprehensive technical analysis with entry/exit points."
        elif prompt_type == 'deep-research':
            # Fetch real market data from Polygon for Deep Research
            logging.info(f"Fetching Polygon market data for {ticker}")
            market_data = fetch_polygon_market_data(ticker)
            market_data_text = format_market_data_for_prompt(ticker, market_data)
            user_text = f"""Analyze {ticker}

{market_data_text}

Based on the market data above, provide a comprehensive 13-point equity research analysis. Use the actual numbers provided to calculate specific price targets (Bear Case / Base Case / Bull Case) based on valuation multiples and DCF considerations."""
        elif prompt_type == 'halal':
            # Fetch real market data from Polygon for Halal compliance check
            logging.info(f"Fetching Polygon market data for {ticker} (Halal check)")
            market_data = fetch_polygon_market_data(ticker)
            market_data_text = format_market_data_for_prompt(ticker, market_data)
            user_text = f"""Check the Halal Status for {ticker}

{market_data_text}

Using the financial data above, perform a comprehensive AAOIFI Shariah compliance analysis. Calculate the specific ratios:
1. Debt-to-Market Cap Ratio (threshold: ≤30%)
2. Interest Income Ratio (threshold: ≤5%)

If the stock ticker is not recognized or data is limited, still provide your best analysis based on available information about the company. Search your knowledge for any information about this company."""
        else:
            user_text = f"Analyze {ticker}"

        logging.info(f"Calling Claude API for {prompt_type}: {ticker} (has_image={has_image})")

        # Build message content - with or without image
        if has_image:
            # Vision request with image
            message_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_media_type,
                        "data": image_base64
                    }
                },
                {
                    "type": "text",
                    "text": user_text
                }
            ]
        else:
            # Text-only request
            message_content = user_text

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=system_prompt,
            messages=[
                {"role": "user", "content": message_content}
            ]
        )

        result = response.content[0].text

        # Cache the result (24 hours) - cache all non-image requests
        if redis_client and not has_image:
            try:
                redis_client.setex(cache_key, 86400, result)
                logging.info(f"Cached result for {cache_key}")
            except Exception as e:
                logging.warning(f"Redis set error: {e}")

        # Record usage
        record_usage(user_id, prompt_type, ticker, month_year, cached=False)

        return func.HttpResponse(
            json.dumps({
                'result': result,
                'cached': False,
                'ticker': ticker,
                'prompt_type': prompt_type,
                'usage': {
                    'used': usage_count + 1,
                    'limit': monthly_limit
                }
            }),
            mimetype='application/json'
        )

    except anthropic.APIError as e:
        logging.error(f"Anthropic API error: {e}")
        return func.HttpResponse(
            json.dumps({'error': f'AI service error: {str(e)}'}),
            status_code=500,
            mimetype='application/json'
        )
    except Exception as e:
        logging.error(f"Error running prompt: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
