"""
Admin endpoint to fix users without subscriptions.
Finds users who signed up since Feb 1 with no subscription and creates 3-day trials.
Does everything in a single database transaction for speed.
Usage: /api/admin-fix-trials
"""

import json
import os
import base64
import logging
from datetime import datetime, timedelta
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_connection, get_cursor, init_schema
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

        # Do everything in one transaction
        conn = get_connection()
        cur = get_cursor(conn)

        # Find users from Feb 1+ with no subscription at all
        cur.execute("""
            SELECT u.id, u.email, u.created_at
            FROM users u
            LEFT JOIN subscriptions s ON s.user_id = u.id
            WHERE s.id IS NULL
              AND u.created_at >= '2026-02-01'
            ORDER BY u.created_at DESC
        """)
        none_users = [dict(row) for row in cur.fetchall()]

        if not none_users:
            cur.close()
            conn.close()
            return func.HttpResponse(
                json.dumps({
                    'success': True,
                    'message': 'No NONE users found to fix',
                    'fixed': 0
                }),
                mimetype='application/json'
            )

        # Create trial subscriptions in bulk
        now = datetime.utcnow()
        trial_end = now + timedelta(days=3)
        fixed = []

        for user in none_users:
            user_id = str(user['id'])
            cur.execute("""
                INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
                VALUES (%s, %s, 'trialing', %s, %s)
            """, (user_id, f'trial_{user_id}', now, trial_end))

            # Mark as no longer new
            cur.execute("""
                UPDATE users SET is_new_user = FALSE, updated_at = NOW()
                WHERE id = %s
            """, (user_id,))

            fixed.append(user['email'])

        conn.commit()
        cur.close()
        conn.close()

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'message': f'Fixed {len(fixed)} users - all now on 3-day trial',
                'fixed': len(fixed),
                'trial_ends': trial_end.isoformat(),
                'users': fixed
            }),
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
