"""
Admin endpoint to fix users without subscriptions.
Finds all users with no subscription record and creates a 3-day trial for them.
Usage: /api/admin-fix-trials
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import fix_users_without_subscription, init_schema
from shared.admin import is_admin


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
        init_schema()

        # Verify admin access
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

        # Run the fix
        result = fix_users_without_subscription(trial_days=3)

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'message': f"Fixed {result['fixed']} users, skipped {result['skipped']}",
                **result
            }, default=str),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Admin fix trials error: {e}")
        import traceback
        return func.HttpResponse(
            json.dumps({
                'error': str(e),
                'traceback': traceback.format_exc()
            }),
            status_code=500,
            mimetype='application/json'
        )
