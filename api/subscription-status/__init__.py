"""
Subscription Status API
Also handles admin reports via ?report=daily or ?report=users
"""

import json
import os
import base64
import logging
from datetime import datetime
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_user_by_email, get_subscription, get_usage_count, init_schema, get_connection, get_cursor
from shared.admin import is_admin, get_monthly_limit, is_beta_mode, BETA_PROMPT_LIMIT


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
    """JSON serializer for datetime objects."""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def get_daily_report(date: str = None):
    """Get daily analytics report."""
    if date is None:
        date = datetime.now().strftime('%Y-%m-%d')

    conn = get_connection()
    cur = get_cursor(conn)

    # New signups today
    cur.execute("""
        SELECT id, email, name, created_at
        FROM users
        WHERE DATE(created_at) = %s
        ORDER BY created_at DESC
    """, (date,))
    new_signups = [dict(row) for row in cur.fetchall()]

    # AI prompts used today
    cur.execute("""
        SELECT prompt_type, COUNT(*) as count
        FROM usage
        WHERE DATE(created_at) = %s
        GROUP BY prompt_type
    """, (date,))
    prompts_used = {row['prompt_type']: row['count'] for row in cur.fetchall()}

    # Total users
    cur.execute("SELECT COUNT(*) as count FROM users")
    total_users = cur.fetchone()['count']

    cur.close()
    conn.close()

    return {
        'date': date,
        'new_signups': len(new_signups),
        'new_signup_list': new_signups,
        'prompts_used': prompts_used,
        'total_users': total_users
    }


def get_all_users():
    """Get all users with stats."""
    conn = get_connection()
    cur = get_cursor(conn)

    cur.execute("""
        SELECT id, email, name, created_at
        FROM users
        ORDER BY created_at DESC
    """)
    users = [dict(row) for row in cur.fetchall()]

    # Get prompt counts
    cur.execute("""
        SELECT user_id, COUNT(*) as prompt_count
        FROM usage
        GROUP BY user_id
    """)
    prompt_counts = {str(row['user_id']): row['prompt_count'] for row in cur.fetchall()}

    # Merge counts into users
    for user in users:
        user_id = str(user['id'])
        user['prompt_count'] = prompt_counts.get(user_id, 0)

    cur.close()
    conn.close()
    return users


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

        # Check for admin report requests
        report_type = req.params.get('report', '').lower()
        if report_type and is_admin(user_email):
            if report_type == 'daily':
                date = req.params.get('date')
                report = get_daily_report(date)
                return func.HttpResponse(
                    json.dumps(report, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'users':
                users = get_all_users()
                return func.HttpResponse(
                    json.dumps({'users': users}, default=json_serializer),
                    mimetype='application/json'
                )

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

        # Get or create user in database
        from shared.database import get_or_create_user
        user = get_user_by_email(user_email)

        # In beta mode, create user if doesn't exist
        if not user and is_beta_mode():
            user = get_or_create_user(user_email, user_email.split('@')[0])

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

        # In beta mode, everyone has access (subscription not required)
        if is_beta_mode():
            has_access = True
        else:
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
            'is_beta': is_beta_mode(),
            'subscription': {
                'status': subscription['status'] if subscription else None,
                'current_period_end': subscription['current_period_end'].isoformat() if subscription and subscription.get('current_period_end') else None,
                'cancel_at_period_end': subscription.get('cancel_at_period_end', False) if subscription else False
            } if subscription else None,
            'usage': usage
        }

        # Add reason if no access (only when not in beta mode)
        if not has_access and not is_beta_mode():
            response['reason'] = 'No active subscription'

        # Add beta message
        if is_beta_mode():
            response['beta_message'] = f'Beta testing mode - {BETA_PROMPT_LIMIT} free prompts per analysis type'

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
