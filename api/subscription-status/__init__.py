"""
Subscription Status API - FIXED VERSION
Auto-syncs with Stripe if subscription not found locally
Also handles admin reports via ?report=daily or ?report=users
"""

import json
import os
import base64
import logging
from datetime import datetime
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import (
    get_user_by_email,
    get_subscription,
    get_usage_count,
    init_schema,
    get_connection,
    get_cursor,
    create_trial_subscription,
    is_user_eligible_for_trial,
    get_or_create_user,
    get_or_create_user_with_trial,
    update_user_stripe_customer,
    create_subscription,
    get_subscription_by_stripe_id,
    get_all_users,  # canonical Stripe-overlayed users list
)
from shared.admin import is_admin, MONTHLY_LIMIT, TRIAL_PROMPT_LIMIT
import stripe

stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
from shared.timezone import now_pst, today_pst


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


def json_serializer(obj):
    """JSON serializer for datetime objects."""
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def auto_sync_stripe_subscription(email: str, user_id: str) -> tuple:
    """
    Automatically sync subscription from Stripe if not found locally.
    This fixes the race condition where webhook hasn't processed yet.
    Returns tuple of (subscription_dict, debug_info) - subscription is None if not found.
    """
    debug_info = {'email': email, 'user_id': user_id}

    if not stripe.api_key:
        logging.warning("Stripe API key not configured, cannot auto-sync")
        debug_info['error'] = 'Stripe API key not configured'
        return None, debug_info

    try:
        # Find customer in Stripe by email
        customers = stripe.Customer.list(email=email, limit=1)
        if not customers.data:
            logging.info(f"No Stripe customer found for {email}")
            debug_info['stripe_customer'] = None
            debug_info['error'] = f'No Stripe customer found for email: {email}'
            return None, debug_info

        customer = customers.data[0]
        customer_id = customer.id
        debug_info['stripe_customer_id'] = customer_id
        debug_info['stripe_customer_email'] = customer.email
        logging.info(f"Found Stripe customer {customer_id} for {email}")

        # Update stripe customer ID on user
        update_user_stripe_customer(email, customer_id)

        # Find active/trialing subscriptions
        subscriptions = stripe.Subscription.list(customer=customer_id, status='active', limit=1)
        if not subscriptions.data:
            subscriptions = stripe.Subscription.list(customer=customer_id, status='trialing', limit=1)

        if not subscriptions.data:
            # Check for ANY subscriptions to see status
            all_subs = stripe.Subscription.list(customer=customer_id, limit=5)
            if all_subs.data:
                debug_info['all_subscription_statuses'] = [s.status for s in all_subs.data]
            else:
                debug_info['all_subscription_statuses'] = []
            logging.info(f"No active subscription found in Stripe for {email}")
            debug_info['error'] = 'No active/trialing subscription found'
            return None, debug_info

        stripe_sub = subscriptions.data[0]
        debug_info['stripe_subscription_id'] = stripe_sub.id
        debug_info['stripe_subscription_status'] = stripe_sub.status
        logging.info(f"Found Stripe subscription {stripe_sub.id} with status {stripe_sub.status}")

        # Check if subscription already exists in our DB
        existing = get_subscription_by_stripe_id(stripe_sub.id)
        if existing:
            logging.info(f"Subscription {stripe_sub.id} already exists in DB")
            debug_info['action'] = 'found_existing'
            return existing, debug_info

        # Delete any trial subscriptions for this user
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            DELETE FROM subscriptions
            WHERE user_id = %s AND stripe_subscription_id LIKE 'trial_%%'
        """, (user_id,))
        deleted_trials = cur.rowcount
        if deleted_trials > 0:
            logging.info(f"Deleted {deleted_trials} trial subscription(s) during auto-sync")
            debug_info['deleted_trials'] = deleted_trials
        conn.commit()
        cur.close()
        conn.close()

        # Create the subscription in our database
        # Period timestamps live on subscription.items.data[0] in newer Stripe API
        from shared.stripe_helpers import get_subscription_period
        period_start, period_end = get_subscription_period(stripe_sub)

        new_sub = create_subscription(
            user_id=user_id,
            stripe_subscription_id=stripe_sub.id,
            status=stripe_sub.status,
            period_start=period_start,
            period_end=period_end
        )

        debug_info['action'] = 'created_new'
        logging.info(f"AUTO-SYNCED subscription {stripe_sub.id} for {email} (user_id={user_id})")
        return new_sub, debug_info

    except Exception as e:
        logging.error(f"Error auto-syncing subscription for {email}: {e}")
        import traceback
        logging.error(traceback.format_exc())
        debug_info['error'] = str(e)
        debug_info['traceback'] = traceback.format_exc()
        return None, debug_info


def get_daily_report(date: str = None):
    """Get daily analytics report."""
    if date is None:
        date = today_pst()  # Use PST timezone

    conn = get_connection()
    cur = get_cursor(conn)

    # New signups today
    cur.execute("""
        SELECT id, email, name, created_at
        FROM users
        WHERE DATE(created_at) = %s
        ORDER BY created_at DESC
    """, (date,))
    new_signups = [dict(row) for row in cur.fetchall()]

    # AI prompts used today
    cur.execute("""
        SELECT prompt_type, COUNT(*) as count
        FROM usage
        WHERE DATE(created_at) = %s
        GROUP BY prompt_type
    """, (date,))
    prompts_used = {row['prompt_type']: row['count'] for row in cur.fetchall()}

    # Total users
    cur.execute("SELECT COUNT(*) as count FROM users")
    total_users = cur.fetchone()['count']

    cur.close()
    conn.close()

    return {
        'date': date,
        'new_signups': len(new_signups),
        'new_signup_list': new_signups,
        'unique_logins': 0,  # Login tracking not yet active
        'total_logins': 0,
        'login_list': [],
        'prompts_used': prompts_used,
        'total_users': total_users,
        'active_users_7d': 0
    }


# NOTE: Local get_all_users() was removed because it shadowed the
# Stripe-overlay version in shared.database and caused the admin
# dashboard's Paid Users count to drift from the actual Stripe state
# (it only ever read the local subscriptions table, never the live API).
# All callers now use the imported shared.database.get_all_users.


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Initialize schema
        init_schema()

        # Diag-key bypass for unauthenticated diagnostic calls (curl/CI).
        # Used by debugging tools to inspect admin-report data without OAuth.
        diag_key = req.headers.get('x-diag-key') or req.params.get('diag_key')
        diag_key_valid = bool(diag_key) and diag_key == os.environ.get('DAILY_EMAIL_KEY')

        # Get authenticated user (unless using diag bypass with a report request)
        auth_user = get_user_from_auth(req)
        if not auth_user and not diag_key_valid:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized'}),
                status_code=401,
                mimetype='application/json'
            )

        user_email = (auth_user.get('userDetails', '') if auth_user else '').lower()
        is_admin_call = is_admin(user_email) if user_email else diag_key_valid

        # Check for admin report requests
        report_type = req.params.get('report', '').lower()
        if report_type and is_admin_call:
            if report_type == 'daily':
                date = req.params.get('date')
                report = get_daily_report(date)
                return func.HttpResponse(
                    json.dumps(report, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'users':
                users = get_all_users()
                # Marker so we can confirm in the response which build is actually
                # serving this request (vs a stale Function worker still warm
                # with the previous code version).
                payload = {
                    'users': users,
                    '_build_marker': 'users-v3-stripe-overlay',
                    '_users_count': len(users),
                    '_paid_in_response': sum(1 for u in users if u.get('subscription_status') == 'active'),
                }
                return func.HttpResponse(
                    json.dumps(payload, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'email-subscribers':
                from shared.database import get_email_subscribers_report
                subscribers = get_email_subscribers_report()
                return func.HttpResponse(
                    json.dumps({'subscribers': subscribers}, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'email-telemetry':
                from shared.database import get_email_telemetry
                days = int(req.params.get('days', '30'))
                telemetry = get_email_telemetry(days)
                return func.HttpResponse(
                    json.dumps({'telemetry': telemetry}, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'reset-email-optout':
                # Reset email_opt_out for all paid/trialing subscribers
                conn = get_connection()
                cur = conn.cursor()
                cur.execute("""
                    UPDATE users SET email_opt_out = FALSE, updated_at = NOW()
                    WHERE id IN (
                        SELECT u.id FROM users u
                        JOIN subscriptions s ON s.user_id = u.id
                        WHERE s.status IN ('active', 'trialing')
                          AND s.current_period_end > NOW()
                          AND u.email_opt_out = TRUE
                    )
                """)
                reset_count = cur.rowcount
                conn.commit()
                cur.close()
                conn.close()
                return func.HttpResponse(
                    json.dumps({'reset': reset_count, 'message': f'Reset email opt-out for {reset_count} subscribers'}),
                    mimetype='application/json'
                )

        # Admin sync subscription feature (manual override)
        sync_email = req.params.get('sync', '').lower().strip()
        if sync_email and is_admin(user_email):
            try:
                # Find customer in Stripe
                customers = stripe.Customer.list(email=sync_email, limit=1)
                if not customers.data:
                    return func.HttpResponse(
                        json.dumps({'error': f'No Stripe customer found for {sync_email}'}),
                        status_code=404,
                        mimetype='application/json'
                    )

                customer = customers.data[0]
                customer_id = customer.id

                # Find subscriptions for this customer
                subscriptions = stripe.Subscription.list(customer=customer_id, status='active', limit=1)
                if not subscriptions.data:
                    subscriptions = stripe.Subscription.list(customer=customer_id, status='trialing', limit=1)

                if not subscriptions.data:
                    return func.HttpResponse(
                        json.dumps({'error': f'No active subscription found for {sync_email}'}),
                        status_code=404,
                        mimetype='application/json'
                    )

                stripe_sub = subscriptions.data[0]

                # Ensure user exists in our database
                target_user = get_user_by_email(sync_email)
                if not target_user:
                    target_user = get_or_create_user(
                        email=sync_email,
                        name=sync_email.split('@')[0],
                        auth_provider='google',
                        auth_provider_id=None
                    )
                    logging.info(f"Created user for {sync_email}")

                # Update stripe customer ID
                update_user_stripe_customer(sync_email, customer_id)

                # Get timestamps from Stripe subscription (newer API moved these to items.data[0])
                from shared.stripe_helpers import get_subscription_period
                _ps, _pe = get_subscription_period(stripe_sub)
                period_start = _ps or int(datetime.now().timestamp())
                period_end = _pe or (int(datetime.now().timestamp()) + (30 * 24 * 60 * 60))

                # Delete any existing subscription with this stripe_id and recreate
                conn = get_connection()
                cur = conn.cursor()
                cur.execute("DELETE FROM subscriptions WHERE stripe_subscription_id = %s", (stripe_sub.id,))
                # Also delete any other subscriptions for this user to avoid conflicts
                cur.execute("DELETE FROM subscriptions WHERE user_id = %s", (str(target_user['id']),))

                # Insert new subscription directly with explicit timestamp conversion
                cur.execute("""
                    INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
                    VALUES (%s, %s, %s, to_timestamp(%s), to_timestamp(%s))
                """, (
                    str(target_user['id']),
                    stripe_sub.id,
                    str(stripe_sub.status),
                    int(period_start),
                    int(period_end)
                ))
                conn.commit()
                cur.close()
                conn.close()

                logging.info(f"Admin {user_email} synced subscription {stripe_sub.id} for {sync_email}")

                return func.HttpResponse(
                    json.dumps({
                        'success': True,
                        'message': f'Subscription synced for {sync_email}',
                        'subscription_id': stripe_sub.id,
                        'status': stripe_sub.status,
                        'user_id': str(target_user['id'])
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

        # Check if admin
        if is_admin(user_email):
            admin_user = get_user_by_email(user_email)
            return func.HttpResponse(
                json.dumps({
                    'has_access': True,
                    'is_admin': True,
                    'is_new_user': False,
                    'has_phone': bool(admin_user.get('phone_number')) if admin_user else True,
                    'subscription': None,
                    'usage': {
                        'chartgpt': {'used': 0, 'limit': 999999},
                        'deep-research': {'used': 0, 'limit': 999999},
                        'halal': {'used': 0, 'limit': 999999}
                    }
                }),
                mimetype='application/json'
            )

        # Get user from database, or create if first visit
        user = get_user_by_email(user_email)

        if not user:
            # First visit — create user with is_new_user=True so trial can be created
            auth_provider = auth_user.get('identityProvider', 'google').lower()
            if auth_provider == 'aad':
                auth_provider = 'microsoft'
            user = get_or_create_user_with_trial(
                email=user_email,
                name=user_email.split('@')[0],
                auth_provider=auth_provider,
                auth_provider_id=auth_user.get('userId', '')
            )
            if not user:
                return func.HttpResponse(
                    json.dumps({
                        'has_access': False,
                        'is_admin': False,
                        'subscription': None,
                        'is_new_user': True,
                        'reason': 'Failed to create user. Please try again.'
                    }),
                    mimetype='application/json'
                )

        user_id = str(user['id'])
        sync_debug = None

        # Get subscription from local database
        subscription = get_subscription(user_id)

        # Debug: Check if there are ANY subscriptions for this user (even non-active)
        all_subs_debug = None
        if not subscription:
            try:
                conn = get_connection()
                cur = get_cursor(conn)
                cur.execute("""
                    SELECT stripe_subscription_id, status, current_period_end
                    FROM subscriptions WHERE user_id = %s
                    ORDER BY created_at DESC LIMIT 5
                """, (user_id,))
                all_subs = cur.fetchall()
                cur.close()
                conn.close()
                if all_subs:
                    all_subs_debug = [dict(s) for s in all_subs]
                    logging.info(f"Found {len(all_subs)} total subscriptions for {user_email}: {all_subs_debug}")
            except Exception as e:
                logging.error(f"Error checking all subscriptions: {e}")

        # ========== AUTO-SYNC FIX ==========
        # If no subscription found locally, try to sync from Stripe
        # This fixes the race condition where webhook hasn't processed yet
        if not subscription:
            logging.info(f"No local subscription for {user_email}, attempting auto-sync from Stripe...")
            synced_sub, sync_debug = auto_sync_stripe_subscription(user_email, user_id)
            if synced_sub:
                # Re-fetch the subscription to get proper format
                subscription = get_subscription(user_id)
                logging.info(f"Auto-sync successful for {user_email}")
        # ====================================

        # Check if user is eligible for trial (new user who never had subscription)
        is_new = user.get('is_new_user', False)
        trial_eligible = is_user_eligible_for_trial(user_email)

        # Auto-create trial for eligible new users (only if no Stripe subscription found)
        if trial_eligible and not subscription:
            subscription = create_trial_subscription(user_id, trial_days=3)
            logging.info(f"Created 3-day trial for new user: {user_email}")

        # Determine access - need active subscription (trial or paid)
        has_access = subscription is not None

        # Check if user is on trial (for prompt limits)
        is_on_trial = (
            subscription is not None
            and (subscription.get('stripe_subscription_id') or '').startswith('trial_')
        )

        # Get usage for current month (PST timezone)
        month_year = now_pst().strftime('%Y-%m')
        monthly_limit = TRIAL_PROMPT_LIMIT if is_on_trial else MONTHLY_LIMIT

        usage = {}
        for prompt_type in ['chartgpt', 'deep-research', 'halal']:
            used = get_usage_count(user_id, prompt_type, month_year)
            usage[prompt_type] = {
                'used': used,
                'limit': monthly_limit
            }

        response = {
            'has_access': has_access,
            'is_admin': False,
            'is_new_user': is_new,
            'has_phone': bool(user.get('phone_number')),
            'subscription': {
                'status': subscription['status'] if subscription else None,
                'current_period_end': subscription['current_period_end'].isoformat() if subscription and subscription.get('current_period_end') else None,
                'cancel_at_period_end': subscription.get('cancel_at_period_end', False) if subscription else False,
                'is_trial': (subscription['stripe_subscription_id'] or '').startswith('trial_') if subscription else False
            } if subscription else None,
            'usage': usage
        }

        # Add reason if no access
        if not has_access:
            response['reason'] = 'No active subscription. Please subscribe to continue.'
            # Include debug info to help diagnose sync issues
            if sync_debug:
                response['sync_debug'] = sync_debug
                if all_subs_debug:
                    response['sync_debug']['local_subscriptions'] = all_subs_debug
            else:
                # No sync attempted, add basic debug
                response['sync_debug'] = {
                    'email': user_email,
                    'user_id': user_id,
                    'is_new_user': is_new,
                    'trial_eligible': trial_eligible,
                    'local_subscriptions': all_subs_debug,
                    'note': 'No Stripe sync attempted - user had local subscription or trial created'
                }

        # Add trial message if on trial
        if subscription and (subscription.get('stripe_subscription_id') or '').startswith('trial_'):
            trial_end = subscription.get('current_period_end')
            if trial_end:
                response['trial_message'] = f'You are on a 3-day free trial ({TRIAL_PROMPT_LIMIT} AI prompts per type). Trial ends {trial_end.strftime("%B %d, %Y")}.'

        return func.HttpResponse(
            json.dumps(response),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error checking subscription status: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
