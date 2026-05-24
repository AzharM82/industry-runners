"""Stripe API version compatibility helpers.

As of the 2024+ Stripe API, `current_period_start` and `current_period_end`
are NO LONGER on the Subscription object — they moved to each item in
`subscription.items.data[i].current_period_start/end`.

Older SDK versions still expose the fields on the subscription object for
some API versions. This module provides a single source of truth that works
for both schemas and prevents the silent "period is None → never renews"
bug that caused paying customers to be stuck on the paywall after their
first renewal.
"""

from __future__ import annotations
from typing import Any

import logging
import os

import stripe

# stripe is a module-level singleton; importing call sites also set this, but
# set it here too so the helpers below work even if imported first.
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')


def find_active_subscription_for_email(email: str, statuses=('active', 'trialing')):
    """Find a live subscription across ALL Stripe customers sharing this email.

    Checkout historically created a new Customer object on every session (it
    passed `customer_email` instead of `customer`), so one user can have several
    Stripe customers with the same email — with the live subscription on only
    one of them. Looking at just one customer (the old `limit=1` lookup) missed
    the sub and showed paying users the paywall. This scans every customer for
    the email and returns the first active/trialing subscription found.

    Returns a tuple of (stripe_subscription, customer), or (None, None).
    """
    email = (email or '').lower().strip()
    if not email:
        return None, None

    try:
        customers = stripe.Customer.list(email=email, limit=100)
    except Exception as e:
        logging.error(f"find_active_subscription_for_email: Customer.list failed for {email}: {e}")
        return None, None

    for customer in customers.auto_paging_iter():
        for status in statuses:
            try:
                subs = stripe.Subscription.list(customer=customer.id, status=status, limit=1)
            except Exception as e:
                logging.error(f"find_active_subscription_for_email: Subscription.list failed for customer {customer.id}: {e}")
                continue
            if subs.data:
                return subs.data[0], customer

    return None, None


def reconcile_all_stripe_subscriptions(dry_run: bool = False) -> dict:
    """Reconcile every live Stripe subscription into the local DB.

    Walks every active/trialing/past_due Stripe subscription, resolves the
    customer (and email) FROM the subscription, ensures the user exists, links
    the stripe_customer_id, and inserts/updates the local subscriptions row.
    Because it iterates *subscriptions* (not customers-by-email) it is immune to
    the duplicate-customer problem and is safe to re-run (idempotent, no deletes).

    This is the same logic as the /api/admin-sync-all-stripe function, lifted into
    a shared helper so it can also be invoked via /api/subscription-status (which
    — unlike admin-sync-all-stripe — is reliably registered by the SWA host).

    Returns a results dict with per-bucket detail and a summary count.
    """
    # Imported lazily to avoid any import cycle with shared.database.
    from shared.database import (
        create_subscription,
        get_connection,
        get_cursor,
        get_or_create_user,
        get_subscription_by_stripe_id,
        get_user_by_email,
        update_user_stripe_customer,
    )

    results = {
        'dry_run': dry_run,
        'created_users': [],
        'linked_customers': [],
        'created_subscriptions': [],
        'updated_subscriptions': [],
        'skipped_no_email': [],
        'errors': [],
    }

    def _update_subscription_row(stripe_sub):
        conn = get_connection()
        cur = get_cursor(conn)
        period_start, period_end = get_subscription_period(stripe_sub)
        # The period_* columns are `timestamp` — Stripe gives Unix ints, so cast
        # with to_timestamp(). COALESCE keeps the existing value if Stripe returns
        # None, so we never null out a date (which would revoke access).
        cur.execute(
            """
            UPDATE subscriptions
            SET status = %s,
                current_period_start = COALESCE(to_timestamp(%s), current_period_start),
                current_period_end = COALESCE(to_timestamp(%s), current_period_end),
                cancel_at_period_end = %s, updated_at = NOW()
            WHERE stripe_subscription_id = %s
            """,
            (stripe_sub.status, period_start, period_end,
             bool(getattr(stripe_sub, 'cancel_at_period_end', False)), stripe_sub.id),
        )
        conn.commit()
        cur.close()
        conn.close()

    for status_filter in ('active', 'trialing', 'past_due'):
        cursor = None
        while True:
            page = stripe.Subscription.list(
                status=status_filter, limit=100, starting_after=cursor,
                expand=['data.customer'],
            )
            for sub in page.data:
                try:
                    customer = sub.customer
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
                            'email': email, 'old': user.get('stripe_customer_id'), 'new': customer.id,
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
                        'email': email, 'stripe_subscription_id': sub.id, 'status': sub.status,
                    })
                except Exception as inner:
                    logging.error(f"reconcile_all_stripe_subscriptions: error syncing {getattr(sub, 'id', '?')}: {inner}")
                    results['errors'].append({
                        'stripe_subscription_id': getattr(sub, 'id', None), 'error': str(inner),
                    })

            if not page.has_more:
                break
            cursor = page.data[-1].id

    results['summary'] = {
        k: len(results[k]) for k in (
            'created_users', 'linked_customers', 'created_subscriptions',
            'updated_subscriptions', 'skipped_no_email', 'errors',
        )
    }
    return results


def find_duplicate_active_subscriptions() -> dict:
    """Find emails with more than one active/trialing Stripe subscription.

    These are likely double-billed: the legacy checkout passed customer_email
    (not customer), so a user who subscribed twice got two customers, each with
    its own active subscription = two monthly charges. Read-only on Stripe.

    Returns {'count': N, 'duplicates': {email: [ {subscription_id, customer_id,
    status, created}, ... ]}}.
    """
    from collections import defaultdict

    by_email = defaultdict(list)
    for status_filter in ('active', 'trialing'):
        cursor = None
        while True:
            page = stripe.Subscription.list(
                status=status_filter, limit=100, starting_after=cursor,
                expand=['data.customer'],
            )
            for sub in page.data:
                try:
                    customer = sub.customer
                    if isinstance(customer, str):
                        customer = stripe.Customer.retrieve(customer)
                    email = (getattr(customer, 'email', None) or '').lower().strip()
                    if not email:
                        continue
                    by_email[email].append({
                        'subscription_id': sub.id,
                        'customer_id': customer.id,
                        'status': sub.status,
                        'created': getattr(sub, 'created', None),
                    })
                except Exception as e:
                    logging.error(f"find_duplicate_active_subscriptions: error on {getattr(sub, 'id', '?')}: {e}")
            if not page.has_more:
                break
            cursor = page.data[-1].id

    duplicates = {email: subs for email, subs in by_email.items() if len(subs) > 1}
    return {'count': len(duplicates), 'duplicates': duplicates}


def _coerce(obj: Any, key: str) -> Any:
    """Read a field from either an object (attribute) or a dict."""
    val = getattr(obj, key, None)
    if val is not None:
        return val
    if hasattr(obj, 'get'):
        return obj.get(key)
    return None


def get_subscription_period(stripe_sub: Any) -> tuple[int | None, int | None]:
    """Return (period_start, period_end) as unix timestamps (seconds).

    Prefers the subscription-level fields for backward compatibility with
    older Stripe API versions, falling back to the first item's period
    which is where newer Stripe API versions (2024+) put them.
    """
    start = _coerce(stripe_sub, 'current_period_start')
    end = _coerce(stripe_sub, 'current_period_end')

    if start is not None and end is not None:
        return start, end

    # New API: look inside items.data[0]
    items = _coerce(stripe_sub, 'items')
    if items is None:
        return start, end

    item_list = _coerce(items, 'data') or items
    if not item_list:
        return start, end

    try:
        first_item = item_list[0]
    except (IndexError, KeyError, TypeError):
        return start, end

    item_start = _coerce(first_item, 'current_period_start')
    item_end = _coerce(first_item, 'current_period_end')

    return (start if start is not None else item_start,
            end if end is not None else item_end)
