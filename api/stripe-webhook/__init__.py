"""
Stripe Webhook Handler
"""

import json
import os
import logging
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    update_user_stripe_customer,
    create_subscription,
    update_subscription,
    get_subscription_by_stripe_id
)

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')


def main(req: func.HttpRequest) -> func.HttpResponse:
    payload = req.get_body().decode('utf-8')
    sig_header = req.headers.get('Stripe-Signature')

    if not WEBHOOK_SECRET:
        logging.error("STRIPE_WEBHOOK_SECRET not configured")
        return func.HttpResponse(status_code=500)

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, WEBHOOK_SECRET
        )
    except ValueError as e:
        logging.error(f"Invalid payload: {e}")
        return func.HttpResponse(status_code=400)
    except stripe.error.SignatureVerificationError as e:
        logging.error(f"Invalid signature: {e}")
        return func.HttpResponse(status_code=400)

    event_type = event['type']
    data = event['data']['object']

    logging.info(f"Received Stripe webhook: {event_type}")

    try:
        if event_type == 'checkout.session.completed':
            handle_checkout_completed(data)

        elif event_type == 'customer.subscription.created':
            handle_subscription_created(data)

        elif event_type == 'customer.subscription.updated':
            handle_subscription_updated(data)

        elif event_type == 'customer.subscription.deleted':
            handle_subscription_deleted(data)

        elif event_type == 'invoice.payment_succeeded':
            handle_payment_succeeded(data)

        elif event_type == 'invoice.payment_failed':
            handle_payment_failed(data)

    except Exception as e:
        logging.error(f"Error handling {event_type}: {e}")
        # Return 200 to prevent Stripe from retrying
        return func.HttpResponse(status_code=200)

    return func.HttpResponse(status_code=200)


def handle_checkout_completed(session):
    """Handle successful checkout."""
    customer_email = session.get('customer_email', '').lower()
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')

    logging.info(f"Checkout completed for {customer_email}")

    if customer_email and customer_id:
        update_user_stripe_customer(customer_email, customer_id)

    # Subscription will be created by subscription.created event


def handle_subscription_created(subscription):
    """Handle new subscription."""
    customer_id = subscription.get('customer')
    subscription_id = subscription.get('id')
    status = subscription.get('status')
    period_start = subscription.get('current_period_start')
    period_end = subscription.get('current_period_end')

    # Get customer email from Stripe
    try:
        customer = stripe.Customer.retrieve(customer_id)
        email = customer.get('email', '').lower()
    except:
        logging.error(f"Could not retrieve customer {customer_id}")
        return

    user = get_user_by_email(email)
    if not user:
        logging.error(f"User not found for email {email}")
        return

    # Check if subscription already exists
    existing = get_subscription_by_stripe_id(subscription_id)
    if existing:
        logging.info(f"Subscription {subscription_id} already exists")
        return

    create_subscription(
        user_id=str(user['id']),
        stripe_subscription_id=subscription_id,
        status=status,
        period_start=period_start,
        period_end=period_end
    )

    logging.info(f"Created subscription for {email}: {status}")


def handle_subscription_updated(subscription):
    """Handle subscription update."""
    subscription_id = subscription.get('id')
    status = subscription.get('status')
    period_end = subscription.get('current_period_end')
    cancel_at_period_end = subscription.get('cancel_at_period_end', False)

    update_subscription(
        stripe_subscription_id=subscription_id,
        status=status,
        period_end=period_end,
        cancel_at_period_end=cancel_at_period_end
    )

    logging.info(f"Updated subscription {subscription_id}: {status}, cancel_at_period_end={cancel_at_period_end}")


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation."""
    subscription_id = subscription.get('id')
    period_end = subscription.get('current_period_end')

    update_subscription(
        stripe_subscription_id=subscription_id,
        status='cancelled',
        period_end=period_end,
        cancel_at_period_end=True
    )

    logging.info(f"Cancelled subscription {subscription_id}")


def handle_payment_succeeded(invoice):
    """Handle successful payment."""
    subscription_id = invoice.get('subscription')
    if subscription_id:
        subscription = stripe.Subscription.retrieve(subscription_id)
        handle_subscription_updated(subscription)


def handle_payment_failed(invoice):
    """Handle failed payment."""
    subscription_id = invoice.get('subscription')
    customer_email = invoice.get('customer_email', '')

    logging.warning(f"Payment failed for {customer_email}, subscription {subscription_id}")

    if subscription_id:
        update_subscription(
            stripe_subscription_id=subscription_id,
            status='past_due',
            period_end=invoice.get('period_end')
        )
