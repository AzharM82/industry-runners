"""
Test webhook sync - Simulates what the webhook handler does.
This helps debug why the webhook isn't creating subscriptions.
Usage: /api/test-webhook-sync?email=user@email.com
"""

import json
import os
import base64
import logging
import azure.functions as func
import stripe

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_connection, get_cursor, get_user_by_email, get_or_create_user,
    update_user_stripe_customer, create_subscription, get_subscription_by_stripe_id
)
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
    steps = []

    try:
        # Check admin
        auth_user = get_user_from_auth(req)
        if not auth_user:
            return func.HttpResponse(json.dumps({'error': 'Unauthorized'}), status_code=401, mimetype='application/json')

        admin_email = auth_user.get('userDetails', '').lower()
        if not is_admin(admin_email):
            return func.HttpResponse(json.dumps({'error': 'Admin only'}), status_code=403, mimetype='application/json')

        email = req.params.get('email', '').lower().strip()
        if not email:
            return func.HttpResponse(json.dumps({'error': 'email parameter required'}), status_code=400, mimetype='application/json')

        steps.append(f"1. Testing sync for: {email}")

        # Step 1: Check if Stripe API key is configured
        if not stripe.api_key:
            steps.append("ERROR: STRIPE_SECRET_KEY not configured!")
            return func.HttpResponse(json.dumps({'steps': steps, 'error': 'Stripe not configured'}, indent=2), mimetype='application/json')
        steps.append("2. Stripe API key is configured")

        # Step 2: Find customer in Stripe
        try:
            customers = stripe.Customer.list(email=email, limit=1)
            if not customers.data:
                steps.append(f"ERROR: No Stripe customer found for {email}")
                return func.HttpResponse(json.dumps({'steps': steps, 'error': 'No Stripe customer'}, indent=2), mimetype='application/json')
            customer = customers.data[0]
            steps.append(f"3. Found Stripe customer: {customer.id}")
        except Exception as e:
            steps.append(f"ERROR finding customer: {str(e)}")
            return func.HttpResponse(json.dumps({'steps': steps, 'error': str(e)}, indent=2), mimetype='application/json')

        # Step 3: Find subscription in Stripe
        try:
            subs = stripe.Subscription.list(customer=customer.id, status='active', limit=1)
            if not subs.data:
                subs = stripe.Subscription.list(customer=customer.id, status='trialing', limit=1)
            if not subs.data:
                # Check all subscriptions
                all_subs = stripe.Subscription.list(customer=customer.id, limit=5)
                statuses = [s.status for s in all_subs.data]
                steps.append(f"ERROR: No active subscription. All statuses: {statuses}")
                return func.HttpResponse(json.dumps({'steps': steps, 'error': 'No active subscription'}, indent=2), mimetype='application/json')
            stripe_sub = subs.data[0]
            steps.append(f"4. Found Stripe subscription: {stripe_sub.id} (status: {stripe_sub.status})")
        except Exception as e:
            steps.append(f"ERROR finding subscription: {str(e)}")
            return func.HttpResponse(json.dumps({'steps': steps, 'error': str(e)}, indent=2), mimetype='application/json')

        # Step 4: Get user from database
        try:
            user = get_user_by_email(email)
            if not user:
                steps.append(f"ERROR: User {email} not found in database")
                return func.HttpResponse(json.dumps({'steps': steps, 'error': 'User not found'}, indent=2), mimetype='application/json')
            user_id = str(user['id'])
            steps.append(f"5. Found user in database: {user_id}")
        except Exception as e:
            steps.append(f"ERROR finding user: {str(e)}")
            return func.HttpResponse(json.dumps({'steps': steps, 'error': str(e)}, indent=2), mimetype='application/json')

        # Step 5: Update stripe customer ID
        try:
            update_user_stripe_customer(email, customer.id)
            steps.append(f"6. Updated user's stripe_customer_id to {customer.id}")
        except Exception as e:
            steps.append(f"ERROR updating stripe customer: {str(e)}")

        # Step 6: Check if subscription already exists
        try:
            existing = get_subscription_by_stripe_id(stripe_sub.id)
            if existing:
                steps.append(f"7. Subscription already exists in DB: {existing}")
                return func.HttpResponse(json.dumps({'steps': steps, 'result': 'Subscription already exists', 'subscription': existing}, default=json_serializer, indent=2), mimetype='application/json')
            steps.append("7. Subscription does NOT exist in DB yet")
        except Exception as e:
            steps.append(f"ERROR checking existing subscription: {str(e)}")

        # Step 7: Delete trial subscriptions
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("DELETE FROM subscriptions WHERE user_id = %s AND stripe_subscription_id LIKE 'trial_%%'", (user_id,))
            deleted = cur.rowcount
            conn.commit()
            cur.close()
            conn.close()
            steps.append(f"8. Deleted {deleted} trial subscription(s)")
        except Exception as e:
            steps.append(f"ERROR deleting trials: {str(e)}")

        # Step 8: Create subscription
        try:
            new_sub = create_subscription(
                user_id=user_id,
                stripe_subscription_id=stripe_sub.id,
                status=stripe_sub.status,
                period_start=stripe_sub.current_period_start,
                period_end=stripe_sub.current_period_end
            )
            steps.append(f"9. Created subscription: {new_sub}")
        except Exception as e:
            steps.append(f"ERROR creating subscription: {str(e)}")
            import traceback
            steps.append(f"Traceback: {traceback.format_exc()}")
            return func.HttpResponse(json.dumps({'steps': steps, 'error': str(e)}, indent=2), mimetype='application/json')

        # Step 9: Verify
        try:
            verify = get_subscription_by_stripe_id(stripe_sub.id)
            steps.append(f"10. Verified subscription exists: {verify is not None}")
        except Exception as e:
            steps.append(f"ERROR verifying: {str(e)}")

        return func.HttpResponse(
            json.dumps({'steps': steps, 'success': True, 'subscription': new_sub}, default=json_serializer, indent=2),
            mimetype='application/json'
        )

    except Exception as e:
        import traceback
        steps.append(f"FATAL ERROR: {str(e)}")
        steps.append(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({'steps': steps, 'error': str(e)}, indent=2),
            status_code=500,
            mimetype='application/json'
        )
