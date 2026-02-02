"""
Admin Sync Subscription API
Manually syncs a Stripe subscription to the database.
Admin only endpoint.
"""

import json
import os
import base64
import logging
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    get_or_create_user,
    update_user_stripe_customer,
    create_subscription,
    get_subscription_by_stripe_id,
    init_schema
)
from shared.admin import is_admin

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')


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

        admin_email = auth_user.get('userDetails', '').lower()

        # Only admins can use this endpoint
        if not is_admin(admin_email):
            return func.HttpResponse(
                json.dumps({'error': 'Admin access required'}),
                status_code=403,
                mimetype='application/json'
            )

        # Get email to sync from request
        try:
            body = req.get_json()
            target_email = body.get('email', '').lower().strip()
        except:
            target_email = req.params.get('email', '').lower().strip()

        if not target_email:
            return func.HttpResponse(
                json.dumps({'error': 'Email parameter required'}),
                status_code=400,
                mimetype='application/json'
            )

        logging.info(f"Admin {admin_email} syncing subscription for {target_email}")

        # Find customer in Stripe
        customers = stripe.Customer.list(email=target_email, limit=1)
        if not customers.data:
            return func.HttpResponse(
                json.dumps({'error': f'No Stripe customer found for {target_email}'}),
                status_code=404,
                mimetype='application/json'
            )

        customer = customers.data[0]
        customer_id = customer.id

        # Find subscriptions for this customer
        subscriptions = stripe.Subscription.list(customer=customer_id, status='active', limit=1)
        if not subscriptions.data:
            # Also check for trialing
            subscriptions = stripe.Subscription.list(customer=customer_id, status='trialing', limit=1)

        if not subscriptions.data:
            return func.HttpResponse(
                json.dumps({'error': f'No active subscription found for {target_email}'}),
                status_code=404,
                mimetype='application/json'
            )

        stripe_sub = subscriptions.data[0]

        # Ensure user exists in our database
        user = get_user_by_email(target_email)
        if not user:
            # Create the user
            user = get_or_create_user(
                email=target_email,
                name=target_email.split('@')[0],
                auth_provider='google',
                auth_provider_id=None
            )
            logging.info(f"Created user for {target_email}")

        # Update stripe customer ID
        update_user_stripe_customer(target_email, customer_id)

        # Check if subscription already exists
        existing = get_subscription_by_stripe_id(stripe_sub.id)
        if existing:
            return func.HttpResponse(
                json.dumps({
                    'success': True,
                    'message': 'Subscription already exists in database',
                    'subscription_id': stripe_sub.id,
                    'status': stripe_sub.status
                }),
                mimetype='application/json'
            )

        # Create subscription in our database
        create_subscription(
            user_id=str(user['id']),
            stripe_subscription_id=stripe_sub.id,
            status=stripe_sub.status,
            period_start=stripe_sub.current_period_start,
            period_end=stripe_sub.current_period_end
        )

        logging.info(f"Synced subscription {stripe_sub.id} for {target_email}")

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'message': f'Subscription synced for {target_email}',
                'subscription_id': stripe_sub.id,
                'status': stripe_sub.status,
                'user_id': str(user['id'])
            }),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error syncing subscription: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
