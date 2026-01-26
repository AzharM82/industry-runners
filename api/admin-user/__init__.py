"""
Admin User Management API - User management and analytics reports
Endpoints:
  GET ?report=daily           - Daily analytics report (today)
  GET ?report=daily&date=X    - Daily report for specific date
  GET ?report=users           - All users list with stats
  GET ?email=X                - Get specific user details
  DELETE ?email=X             - Delete specific user
"""

import json
import os
import base64
import logging
from datetime import datetime
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

    # Check if user_logins table exists and get login data
    logins_today = []
    total_logins = 0
    active_users_7d = 0

    try:
        cur.execute("""
            SELECT email, MAX(created_at) as last_login
            FROM user_logins
            WHERE DATE(created_at) = %s
            GROUP BY email
            ORDER BY last_login DESC
        """, (date,))
        logins_today = [dict(row) for row in cur.fetchall()]

        cur.execute("""
            SELECT COUNT(*) as count FROM user_logins
            WHERE DATE(created_at) = %s
        """, (date,))
        total_logins = cur.fetchone()['count']

        cur.execute("""
            SELECT COUNT(DISTINCT user_id) as count
            FROM user_logins
            WHERE created_at > NOW() - INTERVAL '7 days'
        """)
        active_users_7d = cur.fetchone()['count']
    except Exception as e:
        logging.warning(f"user_logins table may not exist: {e}")

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
        'unique_logins': len(logins_today),
        'total_logins': total_logins,
        'login_list': logins_today,
        'prompts_used': prompts_used,
        'total_users': total_users,
        'active_users_7d': active_users_7d
    }


def get_all_users():
    """Get all users with stats."""
    conn = get_connection()
    cur = get_cursor(conn)

    # Get basic user data first
    cur.execute("""
        SELECT id, email, name, created_at
        FROM users
        ORDER BY created_at DESC
    """)
    users = [dict(row) for row in cur.fetchall()]

    # Try to get login counts if table exists
    try:
        cur.execute("""
            SELECT user_id, COUNT(*) as login_count
            FROM user_logins
            GROUP BY user_id
        """)
        login_counts = {str(row['user_id']): row['login_count'] for row in cur.fetchall()}
    except:
        login_counts = {}

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
        user['login_count'] = login_counts.get(user_id, 0)
        user['prompt_count'] = prompt_counts.get(user_id, 0)

    cur.close()
    conn.close()
    return users


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Initialize schema (creates tables if needed)
        init_schema()

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

        # Check for report parameter first
        report_type = req.params.get('report', '').lower()

        if report_type == 'daily':
            date = req.params.get('date')  # Optional: YYYY-MM-DD
            report = get_daily_report(date)
            return func.HttpResponse(
                json.dumps(report, default=json_serializer),
                mimetype='application/json'
            )

        if report_type == 'users':
            users = get_all_users()
            return func.HttpResponse(
                json.dumps({'users': users}, default=json_serializer),
                mimetype='application/json'
            )

        # Original functionality: Get target email from query param
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
