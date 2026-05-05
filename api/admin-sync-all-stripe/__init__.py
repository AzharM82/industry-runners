"""
Admin Bulk Stripe Reconciliation
================================

Pulls every active+trialing subscription from Stripe and reconciles each one
against the local Postgres `users` + `subscriptions` tables.

Use case: when the admin dashboard shows fewer paid users than Stripe (because
a webhook was missed, the user record never got linked, or subscriptions table
is stale), running this endpoint patches the DB to match Stripe.

Safe to re-run — it upserts and idempotently fixes drift, never deletes.

POST /api/admin-sync-all-stripe          — reconcile and apply changes
POST /api/admin-sync-all-stripe?dry=1    — show what would change without writing
"""

import base64
import json
import logging
import os
import sys
import traceback

import azure.functions as func
import stripe

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.admin import is_admin
from shared.database import (
    create_subscription,
    get_or_create_user,
    get_subscription_by_stripe_id,
    get_user_by_email,
    init_schema,
    update_user_stripe_customer,
)
from shared.stripe_helpers import get_subscription_period


stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')


def _get_user_from_auth(req):
    principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not principal:
        return None
    try:
        return json.loads(base64.b64decode(principal))
    except Exception:
        return None


def _json(payload, status=200):
    return func.HttpResponse(
        json.dumps(payload, default=str, indent=2),
        status_code=status,
        mimetype='application/json',
    )


def _update_subscription_row(stripe_sub):
    """Upsert subscription record for an existing stripe_subscription_id."""
    from shared.database import get_connection, get_cursor
    conn = get_connection()
    cur = get_cursor(conn)
    period_start, period_end = get_subscription_period(stripe_sub)
    cur.execute("""
        UPDATE subscriptions
        SET status = %s,
            current_period_start = %s,
            current_period_end = %s,
            cancel_at_period_end = %s,
            updated_at = NOW()
        WHERE stripe_subscription_id = %s
    """, (
        stripe_sub.status,
        period_start,
        period_end,
        bool(getattr(stripe_sub, 'cancel_at_period_end', False)),
        stripe_sub.id,
    ))
    conn.commit()
    cur.close()
    conn.close()


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        init_schema()

        auth = _get_user_from_auth(req)
        if not auth:
            return _json({'error': 'Unauthorized'}, 401)

        admin_email = (auth.get('userDetails') or '').lower()
        if not is_admin(admin_email):
            return _json({'error': 'Admin access required'}, 403)

        dry_run = (req.params.get('dry') or '').lower() in ('1', 'true', 'yes')

        results = {
            'dry_run': dry_run,
            'created_users': [],
            'linked_customers': [],
            'created_subscriptions': [],
            'updated_subscriptions': [],
            'skipped_no_email': [],
            'errors': [],
        }

        # Walk every Stripe subscription that's still earning revenue.
        for status_filter in ('active', 'trialing', 'past_due'):
            cursor = None
            while True:
                page = stripe.Subscription.list(
                    status=status_filter,
                    limit=100,
                    starting_after=cursor,
                    expand=['data.customer'],
                )
                for sub in page.data:
                    try:
                        customer = sub.customer
                        # Stripe sometimes returns just the id; defend against it.
                        if isinstance(customer, str):
                            customer = stripe.Customer.retrieve(customer)
                        email = (getattr(customer, 'email', None) or '').lower().strip()
                        if not email:
                            results['skipped_no_email'].append({
                                'stripe_customer_id': customer.id,
                                'stripe_subscription_id': sub.id,
                                'reason': 'Stripe customer has no email',
                            })
                            continue

                        existing_sub = get_subscription_by_stripe_id(sub.id)

                        if existing_sub:
                            # Update status/period if drifted (e.g. a renewal Stripe knew about
                            # but our webhook never received).
                            needs_update = (
                                existing_sub.get('status') != sub.status
                                or bool(existing_sub.get('cancel_at_period_end'))
                                != bool(getattr(sub, 'cancel_at_period_end', False))
                            )
                            if needs_update:
                                if not dry_run:
                                    _update_subscription_row(sub)
                                results['updated_subscriptions'].append({
                                    'email': email,
                                    'stripe_subscription_id': sub.id,
                                    'old_status': existing_sub.get('status'),
                                    'new_status': sub.status,
                                })
                            continue

                        # No subscription row yet — make sure user exists, link customer, insert sub.
                        user = get_user_by_email(email)
                        if not user:
                            if dry_run:
                                results['created_users'].append({'email': email, 'stripe_customer_id': customer.id})
                            else:
                                user = get_or_create_user(
                                    email=email,
                                    name=(getattr(customer, 'name', None) or email.split('@')[0]),
                                    auth_provider='stripe',
                                    auth_provider_id=None,
                                )
                                results['created_users'].append({'email': email, 'user_id': str(user['id'])})

                        if user and user.get('stripe_customer_id') != customer.id:
                            if not dry_run:
                                update_user_stripe_customer(email, customer.id)
                            results['linked_customers'].append({
                                'email': email,
                                'old': user.get('stripe_customer_id'),
                                'new': customer.id,
                            })

                        if not dry_run and user:
                            period_start, period_end = get_subscription_period(sub)
                            create_subscription(
                                user_id=str(user['id']),
                                stripe_subscription_id=sub.id,
                                status=sub.status,
                                period_start=period_start,
                                period_end=period_end,
                            )

                        results['created_subscriptions'].append({
                            'email': email,
                            'stripe_subscription_id': sub.id,
                            'status': sub.status,
                        })
                    except Exception as inner:
                        logging.error(f"Error syncing {getattr(sub, 'id', '?')}: {inner}")
                        results['errors'].append({
                            'stripe_subscription_id': getattr(sub, 'id', None),
                            'error': str(inner),
                        })

                if not page.has_more:
                    break
                cursor = page.data[-1].id

        results['summary'] = {
            'created_users': len(results['created_users']),
            'linked_customers': len(results['linked_customers']),
            'created_subscriptions': len(results['created_subscriptions']),
            'updated_subscriptions': len(results['updated_subscriptions']),
            'skipped_no_email': len(results['skipped_no_email']),
            'errors': len(results['errors']),
        }

        return _json(results)

    except Exception as exc:
        logging.error(f"admin-sync-all-stripe failed: {exc}\n{traceback.format_exc()}")
        return _json({'error': str(exc), 'trace': traceback.format_exc()}, 500)
