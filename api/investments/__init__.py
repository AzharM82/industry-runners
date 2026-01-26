"""
Investments API - Stores and retrieves shared portfolio data.
GET: Returns portfolio data (all users)
POST: Saves portfolio data (admin only)
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.admin import is_admin
from shared.cache import get_redis_client

# Redis key for investment data
INVESTMENTS_KEY = 'investments:portfolio:v2'


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


def get_investments():
    """Get investment data from Redis."""
    client = get_redis_client()
    if not client:
        return None

    try:
        data = client.get(INVESTMENTS_KEY)
        if data:
            return json.loads(data)
    except Exception as e:
        logging.error(f"Error getting investments: {e}")

    return None


def save_investments(data):
    """Save investment data to Redis (no TTL - permanent)."""
    client = get_redis_client()
    if not client:
        return False

    try:
        client.set(INVESTMENTS_KEY, json.dumps(data))
        return True
    except Exception as e:
        logging.error(f"Error saving investments: {e}")
        return False


def main(req: func.HttpRequest) -> func.HttpResponse:
    """Handle GET and POST requests for investment data."""
    try:
        if req.method == 'GET':
            # Anyone can read investment data
            data = get_investments()

            if data is None:
                # Return empty portfolio if no data exists
                return func.HttpResponse(
                    json.dumps({
                        'stocks': [],
                        'settings': {
                            'monthlyInvestment': 5000,
                            'startDate': '2026-01',
                            'endDate': '2028-12'
                        }
                    }),
                    mimetype='application/json'
                )

            return func.HttpResponse(
                json.dumps(data),
                mimetype='application/json'
            )

        elif req.method == 'POST':
            # Only admin can save
            auth_user = get_user_from_auth(req)
            if not auth_user:
                return func.HttpResponse(
                    json.dumps({'error': 'Unauthorized'}),
                    status_code=401,
                    mimetype='application/json'
                )

            user_email = auth_user.get('userDetails', '').lower()
            if not is_admin(user_email):
                return func.HttpResponse(
                    json.dumps({'error': 'Admin access required'}),
                    status_code=403,
                    mimetype='application/json'
                )

            # Get request body
            try:
                body = req.get_json()
            except:
                return func.HttpResponse(
                    json.dumps({'error': 'Invalid JSON body'}),
                    status_code=400,
                    mimetype='application/json'
                )

            # Validate required fields
            if 'stocks' not in body or 'settings' not in body:
                return func.HttpResponse(
                    json.dumps({'error': 'Missing stocks or settings'}),
                    status_code=400,
                    mimetype='application/json'
                )

            # Save to Redis
            if save_investments(body):
                return func.HttpResponse(
                    json.dumps({'success': True}),
                    mimetype='application/json'
                )
            else:
                return func.HttpResponse(
                    json.dumps({'error': 'Failed to save - Redis not available'}),
                    status_code=500,
                    mimetype='application/json'
                )

        else:
            return func.HttpResponse(
                json.dumps({'error': 'Method not allowed'}),
                status_code=405,
                mimetype='application/json'
            )

    except Exception as e:
        logging.error(f"Investments API error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
