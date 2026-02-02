"""
Admin User Status API - Diagnostic endpoint to check user and subscription status
"""

import json
import os
import base64
import logging
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_user_by_email, get_subscription, get_connection, get_cursor, init_schema
from shared.admin import is_admin

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')


def get_user_from_auth(req):
    client_principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not client_principal:
        return None
    try:
        decoded = base64.b64decode(client_principal)
        return json.loads(decoded)
    except:
        return None


def json_serializer(obj):
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        init_schema()

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

        target_email = req.params.get('email', '').lower().strip()
        if not target_email:
            return func.HttpResponse(
                json.dumps({'error': 'Email parameter required'}),
                status_code=400,
                mimetype='application/json'
            )

        result = {
            'email': target_email,
            'database': {},
            'stripe': {}
        }

        # Check database
        user = get_user_by_email(target_email)
        if user:
            result['database']['user_exists'] = True
            result['database']['user_id'] = str(user['id'])
            result['database']['stripe_customer_id'] = user.get('stripe_customer_id')
            result['database']['is_new_user'] = user.get('is_new_user')
            result['database']['phone_number'] = user.get('phone_number')
            result['database']['created_at'] = user.get('created_at')

            # Check subscription in database
            sub = get_subscription(str(user['id']))
            if sub:
                result['database']['subscription'] = {
                    'status': sub.get('status'),
                    'stripe_subscription_id': sub.get('stripe_subscription_id'),
                    'current_period_end': sub.get('current_period_end')
                }
            else:
                result['database']['subscription'] = None

            # Also check all subscriptions for this user
            conn = get_connection()
            cur = get_cursor(conn)
            cur.execute("SELECT * FROM subscriptions WHERE user_id = %s", (user['id'],))
            all_subs = [dict(row) for row in cur.fetchall()]
            cur.close()
            conn.close()
            result['database']['all_subscriptions'] = all_subs
        else:
            result['database']['user_exists'] = False

        # Check Stripe
        try:
            customers = stripe.Customer.list(email=target_email, limit=1)
            if customers.data:
                customer = customers.data[0]
                result['stripe']['customer_exists'] = True
                result['stripe']['customer_id'] = customer.id

                subs = stripe.Subscription.list(customer=customer.id, limit=5)
                result['stripe']['subscriptions'] = []
                for s in subs.data:
                    result['stripe']['subscriptions'].append({
                        'id': s.id,
                        'status': s.status,
                        'current_period_end': s.current_period_end
                    })
            else:
                result['stripe']['customer_exists'] = False
        except Exception as e:
            result['stripe']['error'] = str(e)

        return func.HttpResponse(
            json.dumps(result, default=json_serializer, indent=2),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
