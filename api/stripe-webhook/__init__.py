"""
Stripe Webhook Handler - FIXED VERSION
Handles race conditions and ensures subscriptions are properly synced
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
    get_or_create_user,
    update_user_stripe_customer,
    create_subscription,
    update_subscription,
    get_subscription_by_stripe_id,
    init_schema
)

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')


def main(req: func.HttpRequest) -> func.HttpResponse:
    # Initialize schema to ensure tables exist
    init_schema()

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
            
        elif event_type == 'invoice.paid':
            # Handle invoice.paid as a backup
            handle_invoice_paid(data)

    except Exception as e:
        logging.error(f"Error handling {event_type}: {e}")
        import traceback
        logging.error(traceback.format_exc())
        # Return 200 to prevent Stripe from retrying
        return func.HttpResponse(status_code=200)

    return func.HttpResponse(status_code=200)


def get_or_create_user_for_stripe(email: str, customer_id: str = None):
    """
    Robustly get or create a user for Stripe operations.
    Handles email normalization and ensures user exists.
    """
    email = (email or '').lower().strip()
    if not email:
        return None
    
    # Try to find existing user
    user = get_user_by_email(email)
    
    if not user:
        # Create new user
        logging.info(f"Creating new user for {email}")
        user = get_or_create_user(
            email=email,
            name=email.split('@')[0],
            auth_provider='google',  # Most common, will be updated on actual login
            auth_provider_id=customer_id
        )
    
    return user


def sync_subscription_from_stripe(user_id: str, email: str, subscription_id: str, customer_id: str = None):
    """
    Sync a subscription from Stripe to our database.
    This is the central function that ensures subscription state is correct.
    """
    logging.info(f"sync_subscription_from_stripe started")

    try:
        # Get subscription details from Stripe
        logging.info(f"  Step 1: Retrieving subscription from Stripe: {subscription_id}")
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        logging.info(f"  Step 1 SUCCESS: Retrieved subscription, status={stripe_sub.status}")

        # Update stripe customer ID on the user
        if customer_id and email:
            logging.info(f"  Step 2: Updating stripe_customer_id for {email}")
            update_user_stripe_customer(email, customer_id)
            logging.info(f"  Step 2 SUCCESS: Updated stripe_customer_id to {customer_id}")

        # Check if subscription already exists
        logging.info(f"  Step 3: Checking if subscription exists in DB")
        existing = get_subscription_by_stripe_id(subscription_id)

        if existing:
            # Update existing subscription
            logging.info(f"  Step 3: Subscription exists, updating...")
            update_subscription(
                stripe_subscription_id=subscription_id,
                status=stripe_sub.status,
                period_end=stripe_sub.current_period_end,
                cancel_at_period_end=stripe_sub.cancel_at_period_end
            )
            logging.info(f"  Step 3 SUCCESS: Updated existing subscription {subscription_id} - status: {stripe_sub.status}")
        else:
            # Delete any trial subscriptions for this user first
            logging.info(f"  Step 3: Subscription does NOT exist, creating new...")
            logging.info(f"  Step 4: Deleting trial subscriptions for user {user_id}")
            from shared.database import get_connection
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("""
                DELETE FROM subscriptions
                WHERE user_id = %s AND stripe_subscription_id LIKE 'trial_%%'
            """, (user_id,))
            deleted_trials = cur.rowcount
            conn.commit()
            cur.close()
            conn.close()
            logging.info(f"  Step 4 SUCCESS: Deleted {deleted_trials} trial subscription(s)")

            # Create new subscription
            logging.info(f"  Step 5: Creating subscription in database")
            logging.info(f"    user_id: {user_id}")
            logging.info(f"    stripe_subscription_id: {subscription_id}")
            logging.info(f"    status: {stripe_sub.status}")
            logging.info(f"    period_start: {stripe_sub.current_period_start}")
            logging.info(f"    period_end: {stripe_sub.current_period_end}")

            result = create_subscription(
                user_id=user_id,
                stripe_subscription_id=subscription_id,
                status=stripe_sub.status,
                period_start=stripe_sub.current_period_start,
                period_end=stripe_sub.current_period_end
            )

            if result:
                logging.info(f"  Step 5 SUCCESS: Created subscription {subscription_id} for user {user_id}")
            else:
                logging.error(f"  Step 5 FAILED: create_subscription returned None/False")
                return False

        logging.info(f"sync_subscription_from_stripe completed successfully")
        return True

    except Exception as e:
        logging.error(f"sync_subscription_from_stripe FAILED: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return False


def handle_checkout_completed(session):
    """Handle successful checkout - create subscription immediately using metadata."""
    customer_email = (session.get('customer_email') or '').lower().strip()

    # Also try customer_details.email as fallback
    if not customer_email:
        customer_details = session.get('customer_details', {})
        customer_email = (customer_details.get('email') or '').lower().strip()

    customer_id = session.get('customer')
    subscription_id = session.get('subscription')
    metadata = session.get('metadata', {})

    # Get user_id from metadata (set during checkout creation)
    metadata_user_id = metadata.get('user_id')
    metadata_email = (metadata.get('user_email') or '').lower().strip()

    logging.info(f"=== CHECKOUT COMPLETED ===")
    logging.info(f"  customer_email: {customer_email}")
    logging.info(f"  customer_id: {customer_id}")
    logging.info(f"  subscription_id: {subscription_id}")
    logging.info(f"  metadata_user_id: {metadata_user_id}")
    logging.info(f"  metadata_email: {metadata_email}")
    logging.info(f"  full_metadata: {metadata}")

    # Use metadata email if customer_email not available
    email = customer_email or metadata_email
    
    # If still no email, try to get it from the Stripe customer
    if not email and customer_id:
        try:
            customer = stripe.Customer.retrieve(customer_id)
            email = (customer.get('email') or '').lower().strip()
            logging.info(f"Retrieved email {email} from Stripe customer {customer_id}")
        except Exception as e:
            logging.error(f"Could not retrieve customer {customer_id}: {e}")
    
    if not email:
        logging.error("FATAL: No customer email found anywhere!")
        return

    # Find or create user
    user = None
    
    # First, try to find by metadata user_id (most reliable)
    if metadata_user_id:
        from shared.database import get_connection, get_cursor
        conn = get_connection()
        cur = get_cursor(conn)
        try:
            cur.execute("SELECT * FROM users WHERE id = %s", (metadata_user_id,))
            result = cur.fetchone()
            if result:
                user = dict(result)
                logging.info(f"Found user by metadata user_id: {metadata_user_id}")
        except Exception as e:
            logging.error(f"Error finding user by metadata_user_id: {e}")
        finally:
            cur.close()
            conn.close()

    # Try to find by email if not found by user_id
    if not user:
        user = get_or_create_user_for_stripe(email, customer_id)

    if not user:
        logging.error(f"FATAL: Failed to get/create user for {email}")
        return

    user_id = str(user['id'])
    logging.info(f"Processing checkout for user_id={user_id}, email={email}")

    # Sync the subscription
    if subscription_id:
        logging.info(f"Calling sync_subscription_from_stripe:")
        logging.info(f"  user_id: {user_id}")
        logging.info(f"  email: {email}")
        logging.info(f"  subscription_id: {subscription_id}")
        logging.info(f"  customer_id: {customer_id}")

        success = sync_subscription_from_stripe(user_id, email, subscription_id, customer_id)

        if success:
            logging.info(f"=== CHECKOUT COMPLETED SUCCESSFULLY ===")
            logging.info(f"  email: {email}")
            logging.info(f"  subscription_id: {subscription_id}")
        else:
            logging.error(f"=== CHECKOUT FAILED ===")
            logging.error(f"  email: {email}")
            logging.error(f"  subscription_id: {subscription_id}")
            logging.error(f"  sync_subscription_from_stripe returned False")
    else:
        logging.warning(f"No subscription_id in checkout session for {email}")


def handle_subscription_created(subscription):
    """Handle new subscription event from Stripe."""
    customer_id = subscription.get('customer')
    subscription_id = subscription.get('id')
    status = subscription.get('status')

    logging.info(f"=== SUBSCRIPTION CREATED: {subscription_id} (status={status}) ===")

    # Check if subscription already exists (may have been created by checkout.session.completed)
    existing = get_subscription_by_stripe_id(subscription_id)
    if existing:
        logging.info(f"Subscription {subscription_id} already exists (likely from checkout event)")
        return

    # Get customer email from Stripe
    email = None
    try:
        customer = stripe.Customer.retrieve(customer_id)
        email = (customer.get('email') or '').lower().strip()
        logging.info(f"Retrieved customer {customer_id}, email={email}")
    except Exception as e:
        logging.error(f"Could not retrieve customer {customer_id}: {e}")

    if not email:
        logging.error(f"No email found for customer {customer_id}")
        return

    # Get or create user
    user = get_or_create_user_for_stripe(email, customer_id)
    if not user:
        logging.error(f"Failed to create user for {email}")
        return

    # Sync the subscription
    sync_subscription_from_stripe(str(user['id']), email, subscription_id, customer_id)


def handle_subscription_updated(subscription):
    """Handle subscription update."""
    subscription_id = subscription.get('id')
    status = subscription.get('status')
    period_end = subscription.get('current_period_end')
    cancel_at_period_end = subscription.get('cancel_at_period_end', False)
    customer_id = subscription.get('customer')

    logging.info(f"=== SUBSCRIPTION UPDATED: {subscription_id} -> {status} ===")

    # Check if we have this subscription
    existing = get_subscription_by_stripe_id(subscription_id)
    
    if existing:
        update_subscription(
            stripe_subscription_id=subscription_id,
            status=status,
            period_end=period_end,
            cancel_at_period_end=cancel_at_period_end
        )
        logging.info(f"Updated subscription {subscription_id}: status={status}")
    else:
        # Subscription doesn't exist - try to create it
        logging.warning(f"Subscription {subscription_id} not found, attempting to sync from Stripe")
        
        try:
            customer = stripe.Customer.retrieve(customer_id)
            email = (customer.get('email') or '').lower().strip()
            if email:
                user = get_or_create_user_for_stripe(email, customer_id)
                if user:
                    sync_subscription_from_stripe(str(user['id']), email, subscription_id, customer_id)
        except Exception as e:
            logging.error(f"Error syncing missing subscription: {e}")


def handle_subscription_deleted(subscription):
    """Handle subscription cancellation."""
    subscription_id = subscription.get('id')
    period_end = subscription.get('current_period_end')

    logging.info(f"=== SUBSCRIPTION DELETED: {subscription_id} ===")

    update_subscription(
        stripe_subscription_id=subscription_id,
        status='cancelled',
        period_end=period_end,
        cancel_at_period_end=True
    )

    logging.info(f"Cancelled subscription {subscription_id}")


def handle_payment_succeeded(invoice):
    """Handle successful payment - sync subscription status."""
    subscription_id = invoice.get('subscription')
    customer_id = invoice.get('customer')
    customer_email = (invoice.get('customer_email') or '').lower().strip()
    
    logging.info(f"=== PAYMENT SUCCEEDED for subscription {subscription_id} ===")
    
    if subscription_id:
        # Get the subscription and ensure it's properly synced
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            
            # Get user
            email = customer_email
            if not email and customer_id:
                customer = stripe.Customer.retrieve(customer_id)
                email = (customer.get('email') or '').lower().strip()
            
            if email:
                user = get_or_create_user_for_stripe(email, customer_id)
                if user:
                    sync_subscription_from_stripe(str(user['id']), email, subscription_id, customer_id)
        except Exception as e:
            logging.error(f"Error syncing subscription on payment success: {e}")


def handle_invoice_paid(invoice):
    """Handle invoice.paid event - another chance to sync subscription."""
    subscription_id = invoice.get('subscription')
    customer_id = invoice.get('customer')
    customer_email = (invoice.get('customer_email') or '').lower().strip()
    
    logging.info(f"=== INVOICE PAID for subscription {subscription_id} ===")
    
    if subscription_id:
        try:
            email = customer_email
            if not email and customer_id:
                customer = stripe.Customer.retrieve(customer_id)
                email = (customer.get('email') or '').lower().strip()
            
            if email:
                user = get_or_create_user_for_stripe(email, customer_id)
                if user:
                    sync_subscription_from_stripe(str(user['id']), email, subscription_id, customer_id)
        except Exception as e:
            logging.error(f"Error syncing subscription on invoice paid: {e}")


def handle_payment_failed(invoice):
    """Handle failed payment."""
    subscription_id = invoice.get('subscription')
    customer_email = invoice.get('customer_email', '')

    logging.warning(f"=== PAYMENT FAILED for {customer_email}, subscription {subscription_id} ===")

    if subscription_id:
        update_subscription(
            stripe_subscription_id=subscription_id,
            status='past_due',
            period_end=invoice.get('period_end')
        )
