"""
Simple ping endpoint to verify API is working.
No authentication required.

Also doubles as a backdoor for diagnostic calls (gated by DAILY_EMAIL_KEY)
because new dedicated diag endpoints have been hitting SWA function-
registration delays. Use:
  GET /api/ping?diag=stripe-users&key=$DAILY_EMAIL_KEY
"""

import base64
import json
import logging
import os
import sys
import traceback
from datetime import datetime

import azure.functions as func


def _diag_stripe_users():
    """Live Stripe vs DB vs merged get_all_users() comparison."""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from shared.database import get_all_users, get_connection, get_cursor

    # 1. Live Stripe pull
    stripe_emails = set()
    stripe_subs_seen = 0
    stripe_pages = 0
    stripe_error = None
    stripe_key_present = bool(os.environ.get('STRIPE_SECRET_KEY'))
    stripe_sample = []
    try:
        if not stripe_key_present:
            raise RuntimeError('STRIPE_SECRET_KEY not set in this process')
        import stripe
        stripe.api_key = os.environ['STRIPE_SECRET_KEY']
        for status_filter in ('active', 'trialing', 'past_due'):
            cursor = None
            while True:
                page = stripe.Subscription.list(
                    status=status_filter, limit=100, starting_after=cursor,
                    expand=['data.customer'],
                )
                stripe_pages += 1
                for sub in page.data:
                    stripe_subs_seen += 1
                    cust = sub.customer
                    if isinstance(cust, str):
                        try:
                            cust = stripe.Customer.retrieve(cust)
                        except Exception:
                            continue
                    email = (getattr(cust, 'email', None) or '').lower().strip()
                    if email:
                        stripe_emails.add(email)
                        if len(stripe_sample) < 30:
                            stripe_sample.append({'email': email, 'status': sub.status, 'sub_id': sub.id})
                if not page.has_more:
                    break
                cursor = page.data[-1].id
    except Exception as exc:
        stripe_error = f"{type(exc).__name__}: {exc}"
        logging.error(f"ping diag stripe fetch failed: {stripe_error}")

    # 2. Direct DB rows
    db_rows = []
    db_error = None
    try:
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
    except Exception as exc:
        db_error = f"{type(exc).__name__}: {exc}"
        logging.error(f"ping diag db fetch failed: {db_error}")

    db_emails = {(r['email'] or '').lower().strip() for r in db_rows if r['email']}
    db_active = sum(1 for r in db_rows if r['status'] == 'active')

    # 3. Run get_all_users() — what the dashboard actually receives
    merged = []
    merged_error = None
    try:
        merged = get_all_users()
    except Exception as exc:
        merged_error = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"

    merged_paid = [u for u in merged if u.get('subscription_status') == 'active']
    sources = {}
    for u in merged:
        s = u.get('_source', '?')
        sources[s] = sources.get(s, 0) + 1

    return {
        'stripe': {
            'key_present': stripe_key_present,
            'pages_fetched': stripe_pages,
            'subscriptions_seen': stripe_subs_seen,
            'unique_emails': len(stripe_emails),
            'sample': stripe_sample,
            'error': stripe_error,
        },
        'database': {
            'total_users': len(db_rows),
            'with_active_status_in_subs': db_active,
            'error': db_error,
        },
        'merged_get_all_users': {
            'total': len(merged),
            'paid_count': len(merged_paid),
            'sample_paid_emails': [u.get('email') for u in merged_paid[:30]],
            'sources_breakdown': sources,
            'error': merged_error,
        },
        'overlap': {
            'stripe_emails_in_db': len(stripe_emails & db_emails),
            'stripe_emails_NOT_in_db': sorted(list(stripe_emails - db_emails)),
        },
    }


def main(req: func.HttpRequest) -> func.HttpResponse:
    diag = (req.params.get('diag') or '').lower()
    key = req.params.get('key') or req.headers.get('x-diag-key')

    if diag == 'stripe-users':
        expected = os.environ.get('DAILY_EMAIL_KEY')
        if not expected or key != expected:
            return func.HttpResponse(
                json.dumps({'error': 'forbidden — diag requires valid x-diag-key'}),
                status_code=403,
                mimetype='application/json',
            )
        try:
            payload = _diag_stripe_users()
            return func.HttpResponse(
                json.dumps(payload, default=str, indent=2),
                status_code=200,
                mimetype='application/json',
            )
        except Exception as exc:
            return func.HttpResponse(
                json.dumps({'error': str(exc), 'trace': traceback.format_exc()}),
                status_code=500,
                mimetype='application/json',
            )

    return func.HttpResponse(
        json.dumps({
            'status': 'ok',
            'message': 'API is working',
            'timestamp': datetime.utcnow().isoformat(),
        }),
        status_code=200,
        mimetype='application/json',
    )
