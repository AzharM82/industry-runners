"""
Admin Stripe Diagnostic
=======================

Returns counts and matches between:
  - Stripe (live API) paying customers (active|trialing|past_due)
  - Local Postgres `users` + `subscriptions` tables

Plus the merged result that `get_all_users()` produces, so we can pinpoint
where the dashboard count drift is coming from.

Auth: requires header `x-diag-key: <DAILY_EMAIL_KEY>` (an existing shared
secret on the SWA — convenient because no new env var needed). Read-only
on Stripe, read-only on Postgres, no writes anywhere.
"""

import json
import logging
import os
import sys
import traceback
from collections import Counter

import azure.functions as func

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.database import get_all_users, get_connection, get_cursor


def _json(payload, status=200):
    return func.HttpResponse(
        json.dumps(payload, default=str, indent=2),
        status_code=status,
        mimetype='application/json',
    )


def main(req: func.HttpRequest) -> func.HttpResponse:
    expected = os.environ.get('DAILY_EMAIL_KEY')
    provided = req.headers.get('x-diag-key') or req.params.get('key')
    if not expected or provided != expected:
        return _json({'error': 'forbidden'}, 403)

    try:
        # 1. Live Stripe scan (mirrors what get_all_users does)
        stripe_emails: set[str] = set()
        stripe_customers: list[dict] = []
        stripe_error = None
        try:
            import stripe
            stripe.api_key = os.environ['STRIPE_SECRET_KEY']
            for status_filter in ('active', 'trialing', 'past_due'):
                cursor = None
                while True:
                    page = stripe.Subscription.list(
                        status=status_filter, limit=100, starting_after=cursor,
                        expand=['data.customer'],
                    )
                    for sub in page.data:
                        cust = sub.customer
                        if isinstance(cust, str):
                            try:
                                cust = stripe.Customer.retrieve(cust)
                            except Exception:
                                continue
                        email = (getattr(cust, 'email', None) or '').lower().strip()
                        stripe_customers.append({
                            'email': email,
                            'customer_id': getattr(cust, 'id', None),
                            'subscription_id': sub.id,
                            'status': sub.status,
                        })
                        if email:
                            stripe_emails.add(email)
                    if not page.has_more:
                        break
                    cursor = page.data[-1].id
        except Exception as exc:
            stripe_error = f"{type(exc).__name__}: {exc}"
            logging.error(f"diag stripe fetch failed: {stripe_error}")

        # 2. Direct DB read of users + their best subscription row
        conn = get_connection()
        cur = get_cursor(conn)
        cur.execute("""
            SELECT u.email, u.stripe_customer_id, sub.status, sub.current_period_end
            FROM users u
            LEFT JOIN LATERAL (
                SELECT status, current_period_end FROM subscriptions s
                WHERE s.user_id = u.id ORDER BY created_at DESC LIMIT 1
            ) sub ON true
        """)
        db_rows = [dict(r) for r in cur.fetchall()]
        cur.close()
        conn.close()

        db_emails = {(r['email'] or '').lower().strip() for r in db_rows if r['email']}
        db_active_count = sum(1 for r in db_rows if r['status'] == 'active')
        db_trialing_count = sum(1 for r in db_rows if r['status'] == 'trialing')

        # 3. Run get_all_users() — what the admin dashboard receives
        merged_users = get_all_users()
        merged_paid = [u for u in merged_users if u.get('subscription_status') == 'active']
        merged_trial = [u for u in merged_users if u.get('subscription_status') == 'trialing']
        ghosts = [u for u in merged_users if u.get('_source') == 'stripe_only_no_db_user']
        sources = Counter(u.get('_source') for u in merged_users)

        # 4. Per-email match status for the user's Stripe screenshot
        emails_to_check = (req.params.get('emails') or '').split(',')
        emails_to_check = [e.lower().strip() for e in emails_to_check if e.strip()]
        per_email = {}
        for e in emails_to_check:
            in_stripe = e in stripe_emails
            in_db = e in db_emails
            db_row = next((r for r in db_rows if (r['email'] or '').lower().strip() == e), None)
            merged_row = next((u for u in merged_users if (u.get('email') or '').lower().strip() == e), None)
            per_email[e] = {
                'in_stripe': in_stripe,
                'in_db_users': in_db,
                'db_subscription_status': db_row.get('status') if db_row else None,
                'merged_subscription_status': merged_row.get('subscription_status') if merged_row else None,
                'merged_source': merged_row.get('_source') if merged_row else None,
            }

        return _json({
            'stripe': {
                'error': stripe_error,
                'paying_customer_count': len(stripe_customers),
                'unique_emails': len(stripe_emails),
                'sample_emails': sorted(list(stripe_emails))[:25],
            },
            'database': {
                'total_users': len(db_rows),
                'with_active_status': db_active_count,
                'with_trialing_status': db_trialing_count,
            },
            'merged_get_all_users': {
                'total_returned': len(merged_users),
                'active_paid_count': len(merged_paid),
                'trialing_count': len(merged_trial),
                'ghost_users': len(ghosts),
                'sources_breakdown': dict(sources),
                'sample_paid_emails': [u.get('email') for u in merged_paid[:20]],
            },
            'per_email_check': per_email,
        })
    except Exception as exc:
        logging.error(f"admin-stripe-diag error: {exc}\n{traceback.format_exc()}")
        return _json({'error': str(exc), 'trace': traceback.format_exc()}, 500)
