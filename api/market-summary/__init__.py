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


def load_prompt():
    """Load the Market Summary prompt file."""
    prompt_path = os.path.join(os.path.dirname(__file__), '..', '..', 'prompts', 'Market Summary.txt')
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logging.error(f"Could not load Market Summary prompt: {e}")
        return None


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

    # Extract text blocks only (skip tool_use/tool_result blocks)
    summary = ""
    for block in response.content:
        if hasattr(block, 'text'):
            summary += block.text

    return summary


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

    summary_date = today_pst()

    # Check if today's summary already exists (idempotent)
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

    # Generate summary
    logging.info(f"Generating market summary for {summary_date}")
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
