"""
Webhook Logs Diagnostic Endpoint
Admin-only endpoint to view Stripe webhook logs for debugging
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
        # Check admin access
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

        # Get query parameters
        limit = int(req.params.get('limit', '50'))
        event_type = req.params.get('type', '')

        conn = get_connection()
        cur = get_cursor(conn)

        # Check if table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'webhook_logs'
            )
        """)
        table_exists = cur.fetchone()['exists']

        if not table_exists:
            cur.close()
            conn.close()
            return func.HttpResponse(
                json.dumps({
                    'logs': [],
                    'message': 'No webhook logs yet. Table will be created on first webhook.'
                }),
                mimetype='application/json'
            )

        # Get webhook logs
        if event_type:
            cur.execute("""
                SELECT * FROM webhook_logs
                WHERE event_type = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (event_type, limit))
        else:
            cur.execute("""
                SELECT * FROM webhook_logs
                ORDER BY created_at DESC
                LIMIT %s
            """, (limit,))

        logs = [dict(row) for row in cur.fetchall()]

        # Get stats
        cur.execute("""
            SELECT
                event_type,
                status,
                COUNT(*) as count,
                MAX(created_at) as last_seen
            FROM webhook_logs
            GROUP BY event_type, status
            ORDER BY last_seen DESC
        """)
        stats = [dict(row) for row in cur.fetchall()]

        cur.close()
        conn.close()

        # Format datetime for JSON
        for log in logs:
            if log.get('created_at'):
                log['created_at'] = log['created_at'].isoformat()
        for stat in stats:
            if stat.get('last_seen'):
                stat['last_seen'] = stat['last_seen'].isoformat()

        return func.HttpResponse(
            json.dumps({
                'logs': logs,
                'stats': stats,
                'count': len(logs)
            }),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error fetching webhook logs: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
