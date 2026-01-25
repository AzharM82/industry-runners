"""
Run Prompt API - Execute AI prompts with caching
"""

import json
import os
import base64
import logging
from datetime import datetime
import azure.functions as func
import anthropic
import redis

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

        # Check cache (skip for image-based requests since each chart is unique)
        today = datetime.now().strftime('%Y-%m-%d')
        cache_key = f"prompt:{prompt_type}:{ticker}:{today}"
        cached_result = None
        redis_client = get_redis_client()

        # Only use cache for non-image requests
        if redis_client and not has_image:
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
            user_text = f"Analyze {ticker}"
        elif prompt_type == 'halal':
            user_text = f"Check the Halal Status for {ticker}"
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

        # Cache the result (24 hours) - only for non-image requests
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
