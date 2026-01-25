"""
Create Stripe Checkout Session API
"""

import json
import os
import base64
import logging
import urllib.parse
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_or_create_user, init_schema
from shared.admin import is_admin

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_PRICE_ID = os.environ.get('STRIPE_PRICE_ID')
SITE_URL = os.environ.get('SITE_URL', 'https://www.stockproai.net')


def redirect_with_error(error_msg: str) -> func.HttpResponse:
    """Redirect to dashboard with error message."""
    encoded_error = urllib.parse.quote(error_msg)
    return func.HttpResponse(
        status_code=302,
        headers={'Location': f"{SITE_URL}/dashboard?checkout_error={encoded_error}"}
    )


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
        logging.info("create-checkout-session called")

        # Initialize schema on first run
        init_schema()

        # Get authenticated user
        auth_user = get_user_from_auth(req)
        logging.info(f"Auth user: {auth_user}")

        if not auth_user:
            logging.error("No auth user found")
            return redirect_with_error("Not authenticated")

        user_email = auth_user.get('userDetails', '').lower()
        user_name = auth_user.get('userDetails', '').split('@')[0]
        logging.info(f"User email: {user_email}")

        # Check if admin (no payment needed)
        if is_admin(user_email):
            logging.info(f"Admin user {user_email}, redirecting to dashboard")
            return func.HttpResponse(
                status_code=302,
                headers={'Location': f"{SITE_URL}/dashboard"}
            )

        # Get or create user in database
        user = get_or_create_user(
            email=user_email,
            name=user_name,
            auth_provider=auth_user.get('identityProvider'),
            auth_provider_id=auth_user.get('userId')
        )
        logging.info(f"User from DB: {user}")

        if not stripe.api_key:
            logging.error("STRIPE_SECRET_KEY not configured")
            return redirect_with_error("Stripe API key not configured")

        if not STRIPE_PRICE_ID:
            logging.error("STRIPE_PRICE_ID not configured")
            return redirect_with_error("Stripe price ID not configured")

        logging.info(f"Creating Stripe session for {user_email} with price {STRIPE_PRICE_ID}")

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
            cancel_url=f"{SITE_URL}/dashboard?cancelled=true",
            metadata={
                'user_id': str(user['id']),
                'user_email': user_email
            }
        )

        logging.info(f"Created checkout session {session.id} for {user_email}, redirecting to {session.url}")

        # Redirect directly to Stripe checkout
        return func.HttpResponse(
            status_code=302,
            headers={'Location': session.url}
        )

    except Exception as e:
        logging.error(f"Error creating checkout session: {e}")
        return redirect_with_error(str(e))
