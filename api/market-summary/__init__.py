"""
Market Summary API - Generate and retrieve daily AI market summaries
"""

import json
import os
import base64
import logging
from datetime import datetime
import azure.functions as func
import anthropic

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    init_schema,
    save_market_summary,
    get_market_summaries,
    cleanup_old_summaries
)
from shared.timezone import today_pst

ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY')
MARKET_SUMMARY_KEY = os.environ.get('MARKET_SUMMARY_KEY')


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


MARKET_SUMMARY_PROMPT = """You are a market analyst writing a concise, professional daily stock market summary in the style of Investor's Business Daily's "Stock Market Today" segment. Your audience is active investors and swing traders who follow the market daily.

**Step 1: Research**
Search the web for today's market data and news. Gather:
- Closing prices and % changes for: S&P 500, Nasdaq Composite, Dow Jones Industrial Average, Russell 2000
- Market volume vs. prior session (higher or lower volume on NYSE and Nasdaq)
- 10-year Treasury yield
- Key sector rotation (which sectors led, which lagged)
- Major earnings reports released today (beats, misses, guidance)
- 2-4 individual stocks making notable moves on high volume (breakouts, breakdowns, earnings reactions)
- Any macro catalysts (Fed commentary, economic data releases, geopolitical events)
- Current IBD Market Outlook status if available (Confirmed Uptrend, Uptrend Under Pressure, Market in Correction)

**Step 2: Write the Summary**
Produce a single-page daily market summary using EXACTLY this structure:

---

### [HEADLINE — action-oriented, referencing the day's dominant theme]

**[Today's Date] | Market Close**

**The Big Picture**
Write 2-3 sentences summarizing the overall market action. Was it a broad-based move or a split/rotational market? Did the indexes close near highs or lows of the session? Mention if volume was above or below average — this signals institutional conviction. Reference the current market trend status (uptrend, correction, etc.) if identifiable.

**Index Scorecard**
| Index | Close | Change | % Change |
|-------|-------|--------|----------|
| S&P 500 | [price] | [+/-] | [%] |
| Nasdaq Composite | [price] | [+/-] | [%] |
| Dow Jones | [price] | [+/-] | [%] |
| Russell 2000 | [price] | [+/-] | [%] |
| 10-Yr Treasury Yield | [yield] | | [change] |

**What Led Today**
In 2-3 sentences, describe sector leadership and rotation. Which sectors outperformed (healthcare, energy, financials, etc.)? Which lagged (tech, software, semis)? Note any meaningful rotation patterns — money moving from growth to value, large cap to small cap, etc.

**Earnings & Movers**
Cover 3-5 stocks making significant moves. For each, include:
- Ticker and company name
- What happened (earnings beat/miss, guidance, breakout, breakdown)
- The price move and volume context (e.g., "surged 10% on 3x average volume")
- Brief technical context if relevant (breaking out of a base, undercutting support, gap up/down)

**On the Radar**
Mention 2-3 upcoming catalysts for the next session: earnings due after today's close or before tomorrow's open, economic data releases, Fed speakers, or other scheduled events.

**Bottom Line**
One concise paragraph (2-3 sentences) synthesizing the actionable takeaway. Should the investor be increasing exposure, tightening stops, raising cash, or staying the course? Frame this as observational guidance based on price action and market health, not as financial advice.

---

**Formatting Rules:**
- Total output should fit on ONE printed page (~500-650 words max)
- Use a professional, confident, matter-of-fact tone — no hype, no fear-mongering
- Always reference volume when discussing index and stock moves (institutional footprints matter)
- Use ticker symbols in parentheses after company names: e.g., Eli Lilly (LLY)
- Include specific numbers: prices, percentages, volume comparisons
- Do NOT include disclaimers, legal boilerplate, or "this is not financial advice" language in the body — that will be handled separately on the website
- Do NOT use emoji, exclamation marks, or clickbait phrasing
- Write in present tense for today's action, future tense for upcoming catalysts
"""


def load_prompt():
    """Load the Market Summary prompt. Try file first, fall back to embedded."""
    prompt_paths = [
        os.path.join(os.path.dirname(__file__), '..', '..', 'prompts', 'Market Summary.txt'),
        os.path.join(os.path.dirname(__file__), '..', 'prompts', 'Market Summary.txt'),
    ]
    for path in prompt_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception:
            continue
    logging.info("Using embedded Market Summary prompt (file not found in deployment)")
    return MARKET_SUMMARY_PROMPT


def generate_summary(prompt_text: str) -> str:
    """Call Claude API with web search to generate the market summary."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4096,
        tools=[{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 10
        }],
        messages=[{
            "role": "user",
            "content": prompt_text
        }]
    )

    # Concatenate all text blocks, then strip preamble before the formatted summary
    all_text = ""
    for block in response.content:
        if hasattr(block, 'text'):
            all_text += block.text

    # The formatted summary starts with ### (the headline per our prompt template)
    marker = all_text.find('###')
    if marker != -1:
        return all_text[marker:].strip()

    return all_text.strip()


def handle_get(req: func.HttpRequest) -> func.HttpResponse:
    """GET: Return latest market summaries (requires authentication)."""
    auth_user = get_user_from_auth(req)
    if not auth_user:
        return func.HttpResponse(
            json.dumps({'error': 'Unauthorized'}),
            status_code=401,
            mimetype='application/json'
        )

    summaries = get_market_summaries(limit=5)

    # Serialize dates for JSON
    for s in summaries:
        if s.get('summary_date'):
            s['summary_date'] = s['summary_date'].isoformat()
        if s.get('generated_at'):
            s['generated_at'] = s['generated_at'].isoformat()

    return func.HttpResponse(
        json.dumps({'summaries': summaries}),
        mimetype='application/json'
    )


def handle_post(req: func.HttpRequest) -> func.HttpResponse:
    """POST: Generate today's market summary (requires secret key)."""
    # Validate secret key
    key = req.params.get('key')
    if not MARKET_SUMMARY_KEY or key != MARKET_SUMMARY_KEY:
        return func.HttpResponse(
            json.dumps({'error': 'Invalid key'}),
            status_code=403,
            mimetype='application/json'
        )

    if not ANTHROPIC_API_KEY:
        return func.HttpResponse(
            json.dumps({'error': 'ANTHROPIC_API_KEY not configured'}),
            status_code=500,
            mimetype='application/json'
        )

    # Allow generating for a specific date (YYYY-MM-DD) or default to today PST
    date_param = req.params.get('date')
    if date_param:
        try:
            datetime.strptime(date_param, '%Y-%m-%d')
            summary_date = date_param
        except ValueError:
            return func.HttpResponse(
                json.dumps({'error': 'Invalid date format. Use YYYY-MM-DD'}),
                status_code=400,
                mimetype='application/json'
            )
    else:
        summary_date = today_pst()

    # Check if summary already exists (idempotent, skip with force=true)
    force = req.params.get('force', '').lower() == 'true'
    if not force:
        existing = get_market_summaries(limit=1)
        if existing and existing[0].get('summary_date') and existing[0]['summary_date'].isoformat() == summary_date:
            return func.HttpResponse(
                json.dumps({'message': 'Summary already exists for today', 'date': summary_date}),
                mimetype='application/json'
            )

    # Load prompt
    prompt_text = load_prompt()
    if not prompt_text:
        return func.HttpResponse(
            json.dumps({'error': 'Failed to load prompt'}),
            status_code=500,
            mimetype='application/json'
        )

    # Generate summary — if generating for a specific date, prepend it to the prompt
    logging.info(f"Generating market summary for {summary_date}")
    if date_param:
        prompt_text = f"Generate the market summary specifically for the trading day of {summary_date}. Search for market data from that date.\n\n{prompt_text}"
    summary_text = generate_summary(prompt_text)

    if not summary_text or not summary_text.strip():
        return func.HttpResponse(
            json.dumps({'error': 'Generated summary was empty'}),
            status_code=500,
            mimetype='application/json'
        )

    # Save to database
    save_market_summary(summary_date, summary_text)

    # Clean up old summaries
    deleted = cleanup_old_summaries(keep_days=5)
    logging.info(f"Cleaned up {deleted} old market summaries")

    return func.HttpResponse(
        json.dumps({
            'message': 'Summary generated successfully',
            'date': summary_date,
            'length': len(summary_text),
            'cleaned_up': deleted
        }),
        mimetype='application/json'
    )


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        init_schema()

        if req.method == 'GET':
            return handle_get(req)
        elif req.method == 'POST':
            return handle_post(req)
        else:
            return func.HttpResponse(
                json.dumps({'error': 'Method not allowed'}),
                status_code=405,
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
        logging.error(f"Error in market-summary: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
