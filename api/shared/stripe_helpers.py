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
