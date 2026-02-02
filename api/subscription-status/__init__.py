"""
Subscription Status API
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
from shared.database import get_user_by_email, get_subscription, get_usage_count, init_schema, get_connection, get_cursor, create_trial_subscription, is_user_eligible_for_trial, get_or_create_user, update_user_stripe_customer, create_subscription, get_subscription_by_stripe_id
from shared.admin import is_admin, MONTHLY_LIMIT
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


def get_all_users():
    """Get all users with stats, phone numbers, and subscription status."""
    conn = get_connection()
    cur = get_cursor(conn)

    # Get all users with their details
    cur.execute("""
        SELECT id, email, name, phone_number, auth_provider, is_new_user, created_at, last_login_at
        FROM users
        ORDER BY created_at DESC
    """)
    users = [dict(row) for row in cur.fetchall()]

    # Get prompt counts
    cur.execute("""
        SELECT user_id, COUNT(*) as prompt_count
        FROM usage
        GROUP BY user_id
    """)
    prompt_counts = {str(row['user_id']): row['prompt_count'] for row in cur.fetchall()}

    # Get login counts
    cur.execute("""
        SELECT user_id, COUNT(*) as login_count
        FROM user_logins
        GROUP BY user_id
    """)
    login_counts = {str(row['user_id']): row['login_count'] for row in cur.fetchall()}

    # Get subscription status for each user
    cur.execute("""
        SELECT user_id, status, stripe_subscription_id, current_period_end
        FROM subscriptions
        WHERE (status IN ('active', 'trialing') AND current_period_end > NOW())
           OR stripe_subscription_id LIKE 'trial_%'
    """)
    subscriptions = {}
    for row in cur.fetchall():
        user_id = str(row['user_id'])
        subscriptions[user_id] = {
            'status': row['status'],
            'is_trial': row['stripe_subscription_id'].startswith('trial_') if row['stripe_subscription_id'] else False,
            'expires': row['current_period_end']
        }

    # Merge data into users
    for user in users:
        user_id = str(user['id'])
        user['prompt_count'] = prompt_counts.get(user_id, 0)
        user['login_count'] = login_counts.get(user_id, 0)
        user['has_phone'] = bool(user.get('phone_number'))

        # Subscription info
        sub = subscriptions.get(user_id)
        if sub:
            user['subscription_status'] = sub['status']
            user['is_trial'] = sub['is_trial']
            user['subscription_expires'] = sub['expires']
        else:
            user['subscription_status'] = None
            user['is_trial'] = False
            user['subscription_expires'] = None

    cur.close()
    conn.close()
    return users


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

        user_email = auth_user.get('userDetails', '').lower()

        # Check for admin report requests
        report_type = req.params.get('report', '').lower()
        if report_type and is_admin(user_email):
            if report_type == 'daily':
                date = req.params.get('date')
                report = get_daily_report(date)
                return func.HttpResponse(
                    json.dumps(report, default=json_serializer),
                    mimetype='application/json'
                )
            elif report_type == 'users':
                users = get_all_users()
                return func.HttpResponse(
                    json.dumps({'users': users}, default=json_serializer),
                    mimetype='application/json'
                )

        # Admin sync subscription feature
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

                # Check if subscription already exists
                existing = get_subscription_by_stripe_id(stripe_sub.id)
                if existing:
                    # Check if it's linked to the correct user
                    if str(existing.get('user_id')) != str(target_user['id']):
                        # Update the subscription to link to correct user
                        conn = get_connection()
                        cur = conn.cursor()
                        cur.execute("""
                            UPDATE subscriptions
                            SET user_id = %s, updated_at = NOW()
                            WHERE stripe_subscription_id = %s
                        """, (target_user['id'], stripe_sub.id))
                        conn.commit()
                        cur.close()
                        conn.close()
                        logging.info(f"Updated subscription {stripe_sub.id} to user {target_user['id']}")
                        return func.HttpResponse(
                            json.dumps({
                                'success': True,
                                'message': 'Subscription updated to correct user',
                                'subscription_id': stripe_sub.id,
                                'status': stripe_sub.status,
                                'user_id': str(target_user['id'])
                            }),
                            mimetype='application/json'
                        )

                    # Return diagnostic info and also fix the period_end if needed
                    db_period_end = existing.get('current_period_end')
                    stripe_period_end = stripe_sub.current_period_end

                    # Update the subscription with correct data from Stripe
                    conn = get_connection()
                    cur = conn.cursor()
                    cur.execute("""
                        UPDATE subscriptions
                        SET status = %s, current_period_end = to_timestamp(%s), updated_at = NOW()
                        WHERE stripe_subscription_id = %s
                    """, (stripe_sub.status, stripe_period_end, stripe_sub.id))
                    conn.commit()
                    cur.close()
                    conn.close()

                    return func.HttpResponse(
                        json.dumps({
                            'success': True,
                            'message': 'Subscription updated with latest Stripe data',
                            'subscription_id': stripe_sub.id,
                            'status': stripe_sub.status,
                            'db_user_id': str(existing.get('user_id')),
                            'target_user_id': str(target_user['id']),
                            'stripe_period_end': stripe_period_end
                        }),
                        mimetype='application/json'
                    )

                # Create subscription in our database
                create_subscription(
                    user_id=str(target_user['id']),
                    stripe_subscription_id=stripe_sub.id,
                    status=stripe_sub.status,
                    period_start=stripe_sub.current_period_start,
                    period_end=stripe_sub.current_period_end
                )

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

        # Get user from database
        user = get_user_by_email(user_email)

        if not user:
            return func.HttpResponse(
                json.dumps({
                    'has_access': False,
                    'is_admin': False,
                    'subscription': None,
                    'is_new_user': True,
                    'reason': 'User not found. Please log in first.'
                }),
                mimetype='application/json'
            )

        # Get subscription
        subscription = get_subscription(str(user['id']))

        # Check if user is eligible for trial (new user who never had subscription)
        is_new = user.get('is_new_user', False)
        trial_eligible = is_user_eligible_for_trial(user_email)

        # Auto-create trial for eligible new users
        if trial_eligible and not subscription:
            subscription = create_trial_subscription(str(user['id']), trial_days=3)
            logging.info(f"Created 3-day trial for new user: {user_email}")

        # Determine access - need active subscription (trial or paid)
        has_access = subscription is not None

        # Get usage for current month (PST timezone)
        month_year = now_pst().strftime('%Y-%m')
        monthly_limit = MONTHLY_LIMIT

        usage = {}
        for prompt_type in ['chartgpt', 'deep-research', 'halal']:
            used = get_usage_count(str(user['id']), prompt_type, month_year)
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
                'is_trial': subscription['status'] == 'trialing' if subscription else False
            } if subscription else None,
            'usage': usage
        }

        # Add reason if no access
        if not has_access:
            response['reason'] = 'No active subscription. Please subscribe to continue.'

        # Add trial message if on trial
        if subscription and subscription.get('status') == 'trialing':
            trial_end = subscription.get('current_period_end')
            if trial_end:
                response['trial_message'] = f'You are on a 3-day free trial. Trial ends {trial_end.strftime("%B %d, %Y")}.'

        return func.HttpResponse(
            json.dumps(response),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error checking subscription status: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
