"""
Create Stripe Checkout Session API
"""

import json
import os
import base64
import logging
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_or_create_user, init_schema
from shared.admin import is_admin

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_PRICE_ID = os.environ.get('STRIPE_PRICE_ID')
SITE_URL = os.environ.get('SITE_URL', 'https://www.stockproai.net')


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
        # Initialize schema on first run
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
        user_name = auth_user.get('userDetails', '').split('@')[0]

        # Check if admin (no payment needed)
        if is_admin(user_email):
            return func.HttpResponse(
                json.dumps({
                    'message': 'Admin user - no payment required',
                    'redirect': '/dashboard'
                }),
                mimetype='application/json'
            )

        # Get or create user in database
        user = get_or_create_user(
            email=user_email,
            name=user_name,
            auth_provider=auth_user.get('identityProvider'),
            auth_provider_id=auth_user.get('userId')
        )

        if not stripe.api_key or not STRIPE_PRICE_ID:
            return func.HttpResponse(
                json.dumps({'error': 'Stripe not configured'}),
                status_code=500,
                mimetype='application/json'
            )

        # Create Stripe checkout session
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='subscription',
            customer_email=user_email,
            line_items=[{
                'price': STRIPE_PRICE_ID,
                'quantity': 1,
            }],
            success_url=f"{SITE_URL}/dashboard?success=true",
            cancel_url=f"{SITE_URL}/pricing?cancelled=true",
            metadata={
                'user_id': str(user['id']),
                'user_email': user_email
            }
        )

        logging.info(f"Created checkout session for {user_email}")

        return func.HttpResponse(
            json.dumps({'url': session.url}),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error creating checkout session: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
