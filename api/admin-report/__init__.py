"""
Admin Report API - Returns daily analytics for admin users.
Provides signup counts, login counts, usage stats, and user list.
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_daily_report, get_all_users, init_schema
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


def json_serializer(obj):
    """JSON serializer for objects not serializable by default."""
    from datetime import datetime
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


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

        # Only admin can access reports
        if not is_admin(user_email):
            return func.HttpResponse(
                json.dumps({'error': 'Admin access required'}),
                status_code=403,
                mimetype='application/json'
            )

        # Get optional date parameter (default: today)
        date = req.params.get('date')  # Format: YYYY-MM-DD

        # Get report type
        report_type = req.params.get('type', 'daily')  # daily or users

        if report_type == 'users':
            # Return all users list
            users = get_all_users()
            return func.HttpResponse(
                json.dumps({'users': users}, default=json_serializer),
                mimetype='application/json'
            )
        else:
            # Return daily report
            report = get_daily_report(date)
            return func.HttpResponse(
                json.dumps(report, default=json_serializer),
                mimetype='application/json'
            )

    except Exception as e:
        logging.error(f"Admin report error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
