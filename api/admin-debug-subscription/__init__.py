"""
Admin Debug Subscription - Check user and subscription status directly from DB.
Usage: /api/admin-debug-subscription?email=user@email.com
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_connection, get_cursor
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
    """JSON serializer for datetime objects."""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Check if admin
        auth_user = get_user_from_auth(req)
        if not auth_user:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized'}),
                status_code=401,
                mimetype='application/json'
            )

        admin_email = auth_user.get('userDetails', '').lower()
        if not is_admin(admin_email):
            return func.HttpResponse(
                json.dumps({'error': 'Admin access required'}),
                status_code=403,
                mimetype='application/json'
            )

        # Get email to check
        check_email = req.params.get('email', '').lower().strip()
        if not check_email:
            return func.HttpResponse(
                json.dumps({'error': 'Email parameter required. Usage: ?email=user@email.com'}),
                status_code=400,
                mimetype='application/json'
            )

        conn = get_connection()
        cur = get_cursor(conn)

        # Get user info
        cur.execute("""
            SELECT id, email, name, stripe_customer_id, is_new_user, created_at, last_login_at
            FROM users WHERE email = %s
        """, (check_email,))
        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return func.HttpResponse(
                json.dumps({
                    'email': check_email,
                    'user_found': False,
                    'message': 'User not found in database'
                }),
                mimetype='application/json'
            )

        user_dict = dict(user)
        user_id = str(user_dict['id'])

        # Get ALL subscriptions for this user
        cur.execute("""
            SELECT id, stripe_subscription_id, status, current_period_start, current_period_end,
                   cancel_at_period_end, created_at, updated_at
            FROM subscriptions
            WHERE user_id = %s
            ORDER BY created_at DESC
        """, (user_id,))
        subscriptions = [dict(row) for row in cur.fetchall()]

        # Check what get_subscription would return (active only)
        cur.execute("""
            SELECT * FROM subscriptions
            WHERE user_id = %s
            AND status IN ('active', 'trialing')
            AND current_period_end > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        """, (user_id,))
        active_sub = cur.fetchone()

        # Get current server time for comparison
        cur.execute("SELECT NOW() as server_time")
        server_time = cur.fetchone()['server_time']

        cur.close()
        conn.close()

        result = {
            'email': check_email,
            'user_found': True,
            'user': user_dict,
            'all_subscriptions': subscriptions,
            'active_subscription': dict(active_sub) if active_sub else None,
            'subscription_count': len(subscriptions),
            'server_time': server_time,
            'diagnosis': []
        }

        # Add diagnosis
        if not subscriptions:
            result['diagnosis'].append('NO_SUBSCRIPTIONS: User has no subscription records at all')
        else:
            latest = subscriptions[0]
            if latest['status'] not in ('active', 'trialing'):
                result['diagnosis'].append(f"STATUS_NOT_ACTIVE: Latest subscription status is '{latest['status']}' (not active/trialing)")
            if latest['current_period_end'] and latest['current_period_end'] < server_time:
                result['diagnosis'].append(f"EXPIRED: current_period_end ({latest['current_period_end']}) is before server time ({server_time})")
            if active_sub:
                result['diagnosis'].append('OK: Found active subscription that should grant access')

        if not user_dict.get('stripe_customer_id'):
            result['diagnosis'].append('NO_STRIPE_CUSTOMER: User has no stripe_customer_id linked')

        return func.HttpResponse(
            json.dumps(result, default=json_serializer, indent=2),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error in admin-debug-subscription: {e}")
        import traceback
        return func.HttpResponse(
            json.dumps({'error': str(e), 'traceback': traceback.format_exc()}),
            status_code=500,
            mimetype='application/json'
        )
