"""
Stripe Webhook Handler
"""

import json
import os
import logging
import traceback
import stripe
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    get_or_create_user,
    update_user_stripe_customer,
    create_subscription,
    update_subscription,
    get_subscription_by_stripe_id,
    init_schema,
    get_connection,
    get_cursor
)

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')


def log_webhook_event(event_type: str, event_id: str, status: str, details: str = None, error: str = None):
    """Log webhook events to database for debugging."""
    try:
        conn = get_connection()
        cur = conn.cursor()
        # Create table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                event_type VARCHAR(100),
                event_id VARCHAR(100),
                status VARCHAR(50),
                details TEXT,
                error TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            INSERT INTO webhook_logs (event_type, event_id, status, details, error)
            VALUES (%s, %s, %s, %s, %s)
        """, (event_type, event_id, status, details, error))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        logging.error(f"Failed to log webhook event: {e}")


def main(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("=== STRIPE WEBHOOK RECEIVED ===")

    # Initialize schema to ensure tables exist
    init_schema()

    payload = req.get_body().decode('utf-8')
    sig_header = req.headers.get('Stripe-Signature')

    logging.info(f"Payload length: {len(payload)}, Signature present: {bool(sig_header)}")

    if not WEBHOOK_SECRET:
        logging.error("STRIPE_WEBHOOK_SECRET not configured")
        log_webhook_event("unknown", "unknown", "error", error="WEBHOOK_SECRET not configured")
        return func.HttpResponse(status_code=500)

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, WEBHOOK_SECRET
        )
    except ValueError as e:
        logging.error(f"Invalid payload: {e}")
        log_webhook_event("unknown", "unknown", "error", error=f"Invalid payload: {e}")
        return func.HttpResponse(status_code=400)
    except stripe.error.SignatureVerificationError as e:
        logging.error(f"Invalid signature: {e}")
        log_webhook_event("unknown", "unknown", "error", error=f"Signature verification failed: {e}")
        return func.HttpResponse(status_code=400)

    event_type = event['type']
    event_id = event.get('id', 'unknown')
    data = event['data']['object']

    logging.info(f"=== Processing webhook: {event_type} (ID: {event_id}) ===")
    log_webhook_event(event_type, event_id, "received", details=json.dumps(data)[:1000])

    try:
        if event_type == 'checkout.session.completed':
            handle_checkout_completed(data)
            log_webhook_event(event_type, event_id, "success", details="Checkout handled")

        elif event_type == 'customer.subscription.created':
            handle_subscription_created(data)
            log_webhook_event(event_type, event_id, "success", details="Subscription created")

        elif event_type == 'customer.subscription.updated':
            handle_subscription_updated(data)
            log_webhook_event(event_type, event_id, "success", details="Subscription updated")

        elif event_type == 'customer.subscription.deleted':
            handle_subscription_deleted(data)
            log_webhook_event(event_type, event_id, "success", details="Subscription deleted")

        elif event_type == 'invoice.payment_succeeded':
            handle_payment_succeeded(data)
            log_webhook_event(event_type, event_id, "success", details="Payment succeeded")

        elif event_type == 'invoice.payment_failed':
            handle_payment_failed(data)
            log_webhook_event(event_type, event_id, "success", details="Payment failed handled")

        else:
            logging.info(f"Unhandled event type: {event_type}")
            log_webhook_event(event_type, event_id, "ignored", details="Unhandled event type")

    except Exception as e:
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        logging.error(f"Error handling {event_type}: {error_msg}")
        log_webhook_event(event_type, event_id, "error", error=error_msg)
        # Return 200 to prevent Stripe from retrying (they'll keep sending for days)
        # But we now have detailed logs to debug
        return func.HttpResponse(status_code=200)

    logging.info(f"=== Webhook {event_type} processed successfully ===")
    return func.HttpResponse(status_code=200)


def handle_checkout_completed(session):
    """Handle successful checkout - create subscription immediately using metadata."""
    customer_email = (session.get('customer_email') or '').lower()
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')
    metadata = session.get('metadata') or {}

    # Get user_id from metadata (set during checkout creation)
    metadata_user_id = metadata.get('user_id')
    metadata_email = (metadata.get('user_email') or '').lower()

    logging.info(f"=== CHECKOUT COMPLETED ===")
    logging.info(f"  customer_email: {customer_email}")
    logging.info(f"  customer_id: {customer_id}")
    logging.info(f"  subscription_id: {subscription_id}")
    logging.info(f"  metadata: {metadata}")
    logging.info(f"  metadata_user_id: {metadata_user_id}")
    logging.info(f"  metadata_email: {metadata_email}")

    # Use metadata email if customer_email not available
    email = customer_email or metadata_email
    if not email:
        logging.error("FATAL: No customer email in checkout session or metadata!")
        raise ValueError("No customer email found in checkout session")

    # Ensure user exists - prefer finding by metadata user_id
    user = None
    if metadata_user_id:
        logging.info(f"Looking up user by metadata_user_id: {metadata_user_id}")
        conn = get_connection()
        cur = get_cursor(conn)
        cur.execute("SELECT * FROM users WHERE id = %s", (metadata_user_id,))
        result = cur.fetchone()
        if result:
            user = dict(result)
            logging.info(f"Found user by ID: {user['email']}")
        else:
            logging.warning(f"User not found by ID {metadata_user_id}")
        cur.close()
        conn.close()

    if not user:
        logging.info(f"Looking up user by email: {email}")
        user = get_user_by_email(email)
        if user:
            logging.info(f"Found user by email: {user['id']}")

    if not user:
        logging.info(f"Creating new user for {email} from checkout")
        user = get_or_create_user(
            email=email,
            name=email.split('@')[0],
            auth_provider='stripe',
            auth_provider_id=customer_id
        )
        if user:
            logging.info(f"Created new user: {user['id']}")

    if not user:
        logging.error(f"FATAL: Failed to get/create user for {email}")
        raise ValueError(f"Failed to get/create user for {email}")

    logging.info(f"Processing for user: id={user['id']}, email={user['email']}")

    # Update stripe customer ID
    if customer_id:
        logging.info(f"Updating stripe_customer_id to {customer_id}")
        update_user_stripe_customer(email, customer_id)

    # Create subscription immediately if we have subscription_id
    if not subscription_id:
        logging.warning("No subscription_id in checkout session - this might be a one-time payment")
        return

    existing = get_subscription_by_stripe_id(subscription_id)
    if existing:
        logging.info(f"Subscription {subscription_id} already exists in database")
        return

    # Get subscription details from Stripe
    logging.info(f"Retrieving subscription {subscription_id} from Stripe API")
    stripe_sub = stripe.Subscription.retrieve(subscription_id)
    logging.info(f"Stripe subscription status: {stripe_sub.status}")
    logging.info(f"Stripe subscription period: {stripe_sub.current_period_start} to {stripe_sub.current_period_end}")

    # Create subscription in database
    result = create_subscription(
        user_id=str(user['id']),
        stripe_subscription_id=subscription_id,
        status=stripe_sub.status,
        period_start=stripe_sub.current_period_start,
        period_end=stripe_sub.current_period_end
    )

    if result:
        logging.info(f"SUCCESS: Created subscription {subscription_id} for user {user['id']} ({email})")
        logging.info(f"Subscription details: {result}")
    else:
        logging.error(f"FAILED: create_subscription returned None for {subscription_id}")
        raise ValueError(f"Failed to create subscription {subscription_id}")


def handle_subscription_created(subscription):
    """Handle new subscription."""
    customer_id = subscription.get('customer')
    subscription_id = subscription.get('id')
    status = subscription.get('status')
    period_start = subscription.get('current_period_start')
    period_end = subscription.get('current_period_end')
    metadata = subscription.get('metadata', {})

    logging.info(f"Subscription created event: sub={subscription_id}, customer={customer_id}, status={status}")

    # Check if subscription already exists (may have been created by checkout.session.completed)
    existing = get_subscription_by_stripe_id(subscription_id)
    if existing:
        logging.info(f"Subscription {subscription_id} already exists (created by checkout event)")
        return

    # Get customer email from Stripe
    email = None
    try:
        customer = stripe.Customer.retrieve(customer_id)
        email = (customer.get('email') or '').lower()
        logging.info(f"Retrieved customer {customer_id}, email={email}")
    except Exception as e:
        logging.error(f"Could not retrieve customer {customer_id}: {e}")

    if not email:
        logging.error(f"No email found for customer {customer_id}, cannot create subscription")
        return

    # Get or create user - ensures user exists even if they haven't logged in yet
    user = get_user_by_email(email)
    if not user:
        logging.info(f"User not found for {email}, creating new user")
        user = get_or_create_user(
            email=email,
            name=email.split('@')[0],
            auth_provider='stripe',  # Mark as created via Stripe
            auth_provider_id=customer_id
        )
        if not user:
            logging.error(f"Failed to create user for {email}")
            return

    # Update stripe customer ID on user
    update_user_stripe_customer(email, customer_id)

    # Create subscription
    result = create_subscription(
        user_id=str(user['id']),
        stripe_subscription_id=subscription_id,
        status=status,
        period_start=period_start,
        period_end=period_end
    )

    if result:
        logging.info(f"Created subscription {subscription_id} for {email} (user_id={user['id']}): {status}")
    else:
        logging.error(f"Failed to create subscription {subscription_id} for {email}")


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
