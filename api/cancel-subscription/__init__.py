"""
Cancel Subscription API

Lets an authenticated user mark their own Stripe subscription as
`cancel_at_period_end=true`. They keep access until current_period_end;
Stripe does not bill them again. The follow-up webhook
`customer.subscription.updated` will reconcile our DB independently — this
endpoint also writes the flag locally so the UI flips immediately.
"""

import base64
import json
import logging
import os
import sys

import azure.functions as func
import stripe

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    get_subscription,
    update_subscription,
    init_schema,
)
from shared.stripe_helpers import get_subscription_period

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')


def get_user_from_auth(req):
    """Extract user info from Azure Static Web Apps auth header."""
    client_principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not client_principal:
        return None
    try:
        decoded = base64.b64decode(client_principal)
        return json.loads(decoded)
    except Exception:
        return None


def json_response(payload: dict, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload),
        status_code=status_code,
        mimetype='application/json',
    )


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        init_schema()

        auth_user = get_user_from_auth(req)
        if not auth_user:
            return json_response({'error': 'Not authenticated'}, 401)

        user_email = (auth_user.get('userDetails') or '').lower().strip()
        if not user_email:
            return json_response({'error': 'No email on auth principal'}, 401)

        if not stripe.api_key:
            logging.error("STRIPE_SECRET_KEY not configured")
            return json_response({'error': 'Stripe not configured'}, 500)

        user = get_user_by_email(user_email)
        if not user:
            return json_response({'error': 'User not found'}, 404)

        sub = get_subscription(str(user['id']))
        if not sub:
            return json_response(
                {'error': 'No active subscription to cancel'},
                404,
            )

        stripe_sub_id = sub.get('stripe_subscription_id')
        if not stripe_sub_id or stripe_sub_id.startswith('trial_'):
            return json_response(
                {'error': 'Subscription is not managed by Stripe'},
                400,
            )

        logging.info(
            f"Cancelling Stripe subscription {stripe_sub_id} for {user_email} "
            f"(cancel_at_period_end=true)"
        )

        try:
            stripe_sub = stripe.Subscription.modify(
                stripe_sub_id,
                cancel_at_period_end=True,
            )
        except stripe.error.StripeError as e:
            logging.error(f"Stripe error cancelling {stripe_sub_id}: {e}")
            return json_response(
                {'error': f'Stripe error: {str(e)}'},
                502,
            )

        _, period_end = get_subscription_period(stripe_sub)

        update_subscription(
            stripe_subscription_id=stripe_sub_id,
            status=stripe_sub.status,
            period_end=period_end,
            cancel_at_period_end=True,
        )

        logging.info(
            f"Cancelled subscription {stripe_sub_id} for {user_email}; "
            f"period_end={period_end}"
        )

        return json_response({
            'ok': True,
            'cancel_at_period_end': True,
            'status': stripe_sub.status,
            'current_period_end': period_end,
        })

    except Exception as e:
        logging.error(f"cancel-subscription error: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return json_response({'error': str(e)}, 500)
