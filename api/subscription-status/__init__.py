"""
Subscription Status API
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_user_by_email, get_subscription, get_usage_count, init_schema
from shared.admin import is_admin, get_monthly_limit


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

        # Check if admin
        if is_admin(user_email):
            return func.HttpResponse(
                json.dumps({
                    'has_access': True,
                    'is_admin': True,
                    'subscription': None,
                    'usage': {
                        'chartgpt': {'used': 0, 'limit': 999999},
                        'deep-research': {'used': 0, 'limit': 999999},
                        'halal': {'used': 0, 'limit': 999999}
                    }
                }),
                mimetype='application/json'
            )

        # Get user from database
        user = get_user_by_email(user_email)
        if not user:
            return func.HttpResponse(
                json.dumps({
                    'has_access': False,
                    'is_admin': False,
                    'subscription': None,
                    'reason': 'User not found. Please subscribe.'
                }),
                mimetype='application/json'
            )

        # Get subscription
        subscription = get_subscription(str(user['id']))
        has_access = subscription is not None

        # Get usage for current month
        from datetime import datetime
        month_year = datetime.now().strftime('%Y-%m')
        monthly_limit = get_monthly_limit(user_email)

        usage = {}
        for prompt_type in ['chartgpt', 'deep-research', 'halal']:
            used = get_usage_count(str(user['id']), prompt_type, month_year)
            usage[prompt_type] = {
                'used': used,
                'limit': monthly_limit
            }

        response = {
            'has_access': has_access,
            'is_admin': False,
            'subscription': {
                'status': subscription['status'] if subscription else None,
                'current_period_end': subscription['current_period_end'].isoformat() if subscription and subscription.get('current_period_end') else None,
                'cancel_at_period_end': subscription.get('cancel_at_period_end', False) if subscription else False
            } if subscription else None,
            'usage': usage
        }

        if not has_access:
            response['reason'] = 'No active subscription'

        return func.HttpResponse(
            json.dumps(response),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error checking subscription status: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
