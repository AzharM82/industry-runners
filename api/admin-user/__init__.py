"""
Admin User Management API - For debugging subscription issues
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


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Get authenticated user (must be admin)
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

        # Get target email from query param
        target_email = req.params.get('email', '').lower()
        if not target_email:
            return func.HttpResponse(
                json.dumps({'error': 'Email parameter required'}),
                status_code=400,
                mimetype='application/json'
            )

        conn = get_connection()
        cur = get_cursor(conn)

        if req.method == 'GET':
            # Get user info
            cur.execute("SELECT * FROM users WHERE email = %s", (target_email,))
            user = cur.fetchone()

            if not user:
                cur.close()
                conn.close()
                return func.HttpResponse(
                    json.dumps({'message': 'User not found', 'email': target_email}),
                    mimetype='application/json'
                )

            user_dict = dict(user)
            user_id = str(user_dict['id'])

            # Get subscriptions
            cur.execute("SELECT * FROM subscriptions WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            subscriptions = [dict(row) for row in cur.fetchall()]

            # Get usage
            cur.execute("SELECT prompt_type, month_year, COUNT(*) as count FROM usage WHERE user_id = %s GROUP BY prompt_type, month_year", (user_id,))
            usage = [dict(row) for row in cur.fetchall()]

            cur.close()
            conn.close()

            # Convert datetime objects to strings
            for key, value in user_dict.items():
                if hasattr(value, 'isoformat'):
                    user_dict[key] = value.isoformat()

            for sub in subscriptions:
                for key, value in sub.items():
                    if hasattr(value, 'isoformat'):
                        sub[key] = value.isoformat()

            return func.HttpResponse(
                json.dumps({
                    'user': user_dict,
                    'subscriptions': subscriptions,
                    'usage': usage
                }, default=str),
                mimetype='application/json'
            )

        elif req.method == 'DELETE':
            # Delete user and all related data
            cur.execute("SELECT id FROM users WHERE email = %s", (target_email,))
            user = cur.fetchone()

            if not user:
                cur.close()
                conn.close()
                return func.HttpResponse(
                    json.dumps({'message': 'User not found', 'email': target_email}),
                    mimetype='application/json'
                )

            user_id = str(user['id'])

            # Delete usage records
            cur.execute("DELETE FROM usage WHERE user_id = %s", (user_id,))
            usage_deleted = cur.rowcount

            # Delete subscriptions
            cur.execute("DELETE FROM subscriptions WHERE user_id = %s", (user_id,))
            subs_deleted = cur.rowcount

            # Delete user
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))

            conn.commit()
            cur.close()
            conn.close()

            logging.info(f"Admin {admin_email} deleted user {target_email}")

            return func.HttpResponse(
                json.dumps({
                    'message': 'User deleted successfully',
                    'email': target_email,
                    'deleted': {
                        'usage_records': usage_deleted,
                        'subscriptions': subs_deleted,
                        'user': 1
                    }
                }),
                mimetype='application/json'
            )

    except Exception as e:
        logging.error(f"Error in admin-user endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
