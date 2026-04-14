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
