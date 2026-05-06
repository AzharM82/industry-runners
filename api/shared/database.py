"""
Database utilities for StockPro AI
"""

import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor

from .timezone import today_pst

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_connection():
    """Get a database connection."""
    if not DATABASE_URL:
        raise Exception("DATABASE_URL not configured")
    return psycopg2.connect(DATABASE_URL)

def get_cursor(conn):
    """Get a cursor that returns dicts."""
    return conn.cursor(cursor_factory=RealDictCursor)

def init_schema():
    """Initialize database schema if not exists."""
    schema_sql = """
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        phone_number VARCHAR(20),
        auth_provider VARCHAR(50),
        auth_provider_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        is_admin BOOLEAN DEFAULT FALSE,
        is_new_user BOOLEAN DEFAULT TRUE,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Subscriptions table
    CREATE TABLE IF NOT EXISTS subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        stripe_subscription_id VARCHAR(255) UNIQUE,
        status VARCHAR(50) NOT NULL DEFAULT 'inactive',
        current_period_start TIMESTAMP,
        current_period_end TIMESTAMP,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Usage tracking table
    CREATE TABLE IF NOT EXISTS usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        prompt_type VARCHAR(50) NOT NULL,
        ticker VARCHAR(20) NOT NULL,
        month_year VARCHAR(7) NOT NULL,
        cached BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- User logins table for tracking login events
    CREATE TABLE IF NOT EXISTS user_logins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- Market summaries table (daily AI-generated market summaries)
    CREATE TABLE IF NOT EXISTS market_summaries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        summary_date DATE UNIQUE NOT NULL,
        summary_text TEXT NOT NULL,
        generated_at TIMESTAMP DEFAULT NOW()
    );

    -- Email log table (tracks daily recap email sends)
    CREATE TABLE IF NOT EXISTS email_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        email VARCHAR(255) NOT NULL,
        send_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- Investment stocks table (long-term portfolio)
    CREATE TABLE IF NOT EXISTS investment_stocks (
        id SERIAL PRIMARY KEY,
        ticker VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        added_quarter VARCHAR(10) NOT NULL,
        added_month VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- Investment buys table (monthly purchases)
    CREATE TABLE IF NOT EXISTS investment_buys (
        id SERIAL PRIMARY KEY,
        stock_id INTEGER REFERENCES investment_stocks(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        buy_date DATE NOT NULL,
        shares NUMERIC(12,4) NOT NULL,
        price_per_share NUMERIC(12,4) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        locked BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, prompt_type, month_year);
    CREATE INDEX IF NOT EXISTS idx_user_logins_created ON user_logins(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_logins_user ON user_logins(user_id);
    CREATE INDEX IF NOT EXISTS idx_market_summaries_date ON market_summaries(summary_date);
    CREATE INDEX IF NOT EXISTS idx_email_log_date ON email_log(send_date);
    CREATE INDEX IF NOT EXISTS idx_email_log_email ON email_log(email);
    CREATE INDEX IF NOT EXISTS idx_investment_stocks_ticker ON investment_stocks(ticker);
    CREATE INDEX IF NOT EXISTS idx_investment_buys_stock ON investment_buys(stock_id);
    """

    # Migration SQL for existing tables
    migration_sql = """
    -- Add last_login_at column to users table if it doesn't exist
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'last_login_at'
        ) THEN
            ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
        END IF;
    END $$;

    -- Add phone_number column to users table if it doesn't exist
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'phone_number'
        ) THEN
            ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
        END IF;
    END $$;

    -- Add is_new_user column to users table if it doesn't exist
    -- Existing users are marked as NOT new (they don't get trial)
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'is_new_user'
        ) THEN
            ALTER TABLE users ADD COLUMN is_new_user BOOLEAN DEFAULT FALSE;
        END IF;
    END $$;

    -- Add email_opt_out column to users table if it doesn't exist
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'email_opt_out'
        ) THEN
            ALTER TABLE users ADD COLUMN email_opt_out BOOLEAN DEFAULT FALSE;
        END IF;
    END $$;

    """

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(schema_sql)
        cur.execute(migration_sql)
        conn.commit()
        cur.close()
        conn.close()
        logging.info("Database schema initialized successfully")
        return True
    except Exception as e:
        logging.error(f"Error initializing schema: {e}")
        return False

def get_or_create_user(email: str, name: str = None, auth_provider: str = None, auth_provider_id: str = None):
    """Get existing user or create new one."""
    conn = get_connection()
    cur = get_cursor(conn)

    # Check if user exists
    cur.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
    user = cur.fetchone()

    if not user:
        # Create new user
        cur.execute("""
            INSERT INTO users (email, name, auth_provider, auth_provider_id)
            VALUES (%s, %s, %s, %s)
            RETURNING *
        """, (email.lower(), name, auth_provider, auth_provider_id))
        user = cur.fetchone()
        conn.commit()

    cur.close()
    conn.close()
    return dict(user) if user else None

def get_user_by_email(email: str):
    """Get user by email."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return dict(user) if user else None

def update_user_stripe_customer(email: str, stripe_customer_id: str):
    """Update user's Stripe customer ID."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE users SET stripe_customer_id = %s, updated_at = NOW()
        WHERE email = %s
    """, (stripe_customer_id, email.lower()))
    conn.commit()
    cur.close()
    conn.close()

def get_subscription(user_id: str):
    """Get user's active subscription."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT * FROM subscriptions
        WHERE user_id = %s
        AND status IN ('active', 'trialing')
        AND current_period_end > NOW()
        ORDER BY created_at DESC
        LIMIT 1
    """, (user_id,))
    sub = cur.fetchone()
    cur.close()
    conn.close()
    return dict(sub) if sub else None

def get_subscription_by_stripe_id(stripe_subscription_id: str):
    """Get subscription by Stripe subscription ID."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT * FROM subscriptions WHERE stripe_subscription_id = %s
    """, (stripe_subscription_id,))
    sub = cur.fetchone()
    cur.close()
    conn.close()
    return dict(sub) if sub else None

def create_subscription(user_id: str, stripe_subscription_id: str, status: str, period_start, period_end):
    """Create a new subscription."""
    import logging

    logging.info(f"create_subscription called:")
    logging.info(f"  user_id: {user_id}")
    logging.info(f"  stripe_subscription_id: {stripe_subscription_id}")
    logging.info(f"  status: {status}")
    logging.info(f"  period_start: {period_start} (type: {type(period_start).__name__})")
    logging.info(f"  period_end: {period_end} (type: {type(period_end).__name__})")

    # Validate inputs
    if not user_id or not stripe_subscription_id:
        logging.error("create_subscription: Missing required fields")
        return None

    # Handle None timestamps - use current time as fallback
    from datetime import datetime
    if period_start is None:
        period_start = int(datetime.utcnow().timestamp())
        logging.warning(f"period_start was None, using current time: {period_start}")
    if period_end is None:
        period_end = int(datetime.utcnow().timestamp()) + (30 * 24 * 60 * 60)  # 30 days
        logging.warning(f"period_end was None, using 30 days from now: {period_end}")

    try:
        conn = get_connection()
        cur = get_cursor(conn)
        cur.execute("""
            INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
            VALUES (%s, %s, %s, to_timestamp(%s), to_timestamp(%s))
            RETURNING *
        """, (user_id, stripe_subscription_id, status, period_start, period_end))
        sub = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        if sub:
            logging.info(f"create_subscription SUCCESS: Created subscription {stripe_subscription_id}")
            return dict(sub)
        else:
            logging.error("create_subscription: INSERT succeeded but no row returned")
            return None

    except Exception as e:
        logging.error(f"create_subscription FAILED: {e}")
        import traceback
        logging.error(traceback.format_exc())
        return None

def update_subscription(stripe_subscription_id: str, status: str, period_end, cancel_at_period_end: bool = False):
    """Update subscription status."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE subscriptions
        SET status = %s, current_period_end = to_timestamp(%s), cancel_at_period_end = %s, updated_at = NOW()
        WHERE stripe_subscription_id = %s
    """, (status, period_end, cancel_at_period_end, stripe_subscription_id))
    conn.commit()
    cur.close()
    conn.close()

def get_usage_count(user_id: str, prompt_type: str, month_year: str) -> int:
    """Get usage count for a user/prompt/month."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM usage
        WHERE user_id = %s AND prompt_type = %s AND month_year = %s
    """, (user_id, prompt_type, month_year))
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return count

def record_usage(user_id: str, prompt_type: str, ticker: str, month_year: str, cached: bool = False):
    """Record a prompt usage."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO usage (user_id, prompt_type, ticker, month_year, cached)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, prompt_type, ticker.upper(), month_year, cached))
    conn.commit()
    cur.close()
    conn.close()

def record_login(user_id: str, email: str, ip_address: str = None, user_agent: str = None):
    """Record a user login event and update last_login_at."""
    conn = get_connection()
    cur = conn.cursor()

    # Record the login event
    cur.execute("""
        INSERT INTO user_logins (user_id, email, ip_address, user_agent)
        VALUES (%s, %s, %s, %s)
    """, (user_id, email.lower(), ip_address, user_agent))

    # Update last_login_at on user
    cur.execute("""
        UPDATE users SET last_login_at = NOW() WHERE id = %s
    """, (user_id,))

    conn.commit()
    cur.close()
    conn.close()


def get_daily_report(date: str = None):
    """
    Get daily report of signups, logins, and usage.
    If date is None, returns today's report.
    Date format: YYYY-MM-DD
    """
    from datetime import datetime, timedelta

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

    # Logins today (unique users with their last login time)
    cur.execute("""
        SELECT email, MAX(created_at) as last_login
        FROM user_logins
        WHERE DATE(created_at) = %s
        GROUP BY email
        ORDER BY last_login DESC
    """, (date,))
    logins_today = [dict(row) for row in cur.fetchall()]

    # Total login count today
    cur.execute("""
        SELECT COUNT(*) as count FROM user_logins
        WHERE DATE(created_at) = %s
    """, (date,))
    total_logins = cur.fetchone()['count']

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

    # Active users (logged in within last 7 days)
    cur.execute("""
        SELECT COUNT(DISTINCT user_id) as count
        FROM user_logins
        WHERE created_at > NOW() - INTERVAL '7 days'
    """)
    active_users_7d = cur.fetchone()['count']

    cur.close()
    conn.close()

    return {
        'date': date,
        'new_signups': len(new_signups),
        'new_signup_list': new_signups,
        'unique_logins': len(logins_today),
        'total_logins': total_logins,
        'login_list': logins_today,
        'prompts_used': prompts_used,
        'total_users': total_users,
        'active_users_7d': active_users_7d
    }


def get_all_users():
    """Get all users with subscription status sourced LIVE from Stripe.

    Root-cause fix: the local `subscriptions` table goes stale when Stripe
    webhooks are missed (network blips, replays, signups before webhook was
    wired). That made the admin "Paid Users" count drift from reality.

    Strategy:
      1. Query DB for the canonical user list (id, login stats, etc.).
      2. Query Stripe live for every active/trialing/past_due subscription
         and key it by customer email.
      3. Merge: subscription_status is sourced from Stripe when present,
         otherwise from the DB row (covers users who never paid).
      4. Append any Stripe customer with an active sub but no DB user as
         a "ghost" row so the admin can see and reconcile them.

    Stripe is the source of truth — no DB writes happen here.
    """
    import logging
    import os
    from datetime import datetime, timezone

    conn = get_connection()
    cur = get_cursor(conn)

    cur.execute("""
        SELECT
            u.id,
            u.email,
            u.name,
            u.phone_number,
            u.stripe_customer_id,
            u.created_at,
            u.last_login_at,
            COALESCE(l.login_count, 0) as login_count,
            COALESCE(p.prompt_count, 0) as prompt_count,
            sub.status              AS subscription_status,
            sub.current_period_end  AS subscription_period_end,
            sub.cancel_at_period_end AS subscription_cancel_at_period_end,
            sub.stripe_subscription_id
        FROM users u
        LEFT JOIN (
            SELECT user_id, COUNT(*) as login_count
            FROM user_logins
            GROUP BY user_id
        ) l ON l.user_id = u.id
        LEFT JOIN (
            SELECT user_id, COUNT(*) as prompt_count
            FROM usage
            GROUP BY user_id
        ) p ON p.user_id = u.id
        LEFT JOIN LATERAL (
            SELECT status, current_period_end, cancel_at_period_end, stripe_subscription_id
            FROM subscriptions s
            WHERE s.user_id = u.id
            ORDER BY
                CASE
                    WHEN status IN ('active','trialing')
                         AND (current_period_end IS NULL OR current_period_end > NOW())
                    THEN 0 ELSE 1
                END,
                created_at DESC
            LIMIT 1
        ) sub ON true
        ORDER BY u.created_at DESC
    """)
    users = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()

    # --- Pull live subscription state from Stripe ----------------------
    stripe_subs_by_email: dict[str, dict] = {}
    stripe_subs_by_customer_id: dict[str, dict] = {}
    stripe_error: str | None = None

    if os.environ.get('STRIPE_SECRET_KEY'):
        try:
            import stripe
            stripe.api_key = os.environ['STRIPE_SECRET_KEY']
            from .stripe_helpers import get_subscription_period

            # Status priority: active outranks trialing, trialing outranks past_due.
            status_rank = {'active': 3, 'trialing': 2, 'past_due': 1}

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
                        customer = sub.customer
                        if isinstance(customer, str):
                            try:
                                customer = stripe.Customer.retrieve(customer)
                            except Exception:
                                continue
                        email = (getattr(customer, 'email', None) or '').lower().strip()
                        cust_id = getattr(customer, 'id', None)
                        period_start, period_end = get_subscription_period(sub)
                        period_end_dt = (
                            datetime.fromtimestamp(period_end, tz=timezone.utc)
                            if period_end else None
                        )
                        record = {
                            'subscription_status': sub.status,
                            'subscription_period_end': period_end_dt,
                            'subscription_cancel_at_period_end': bool(getattr(sub, 'cancel_at_period_end', False)),
                            'stripe_subscription_id': sub.id,
                            'stripe_customer_id': cust_id,
                            'stripe_customer_email': email,
                        }
                        # Take the highest-priority record per email + per customer_id
                        for key_dict, key_val in (
                            (stripe_subs_by_email, email),
                            (stripe_subs_by_customer_id, cust_id),
                        ):
                            if not key_val:
                                continue
                            existing = key_dict.get(key_val)
                            if (
                                existing is None
                                or status_rank.get(sub.status, 0)
                                > status_rank.get(existing['subscription_status'], 0)
                            ):
                                key_dict[key_val] = record
                    if not page.has_more:
                        break
                    cursor = page.data[-1].id
        except Exception as exc:
            stripe_error = str(exc)
            logging.error(f"get_all_users: live Stripe fetch failed, falling back to DB only: {exc}")

    # --- Overlay Stripe truth onto DB users ----------------------------
    for u in users:
        email = (u.get('email') or '').lower().strip()
        cust_id = u.get('stripe_customer_id')

        # Prefer match by stripe_customer_id (most reliable), fall back to email.
        stripe_record = (
            (stripe_subs_by_customer_id.get(cust_id) if cust_id else None)
            or stripe_subs_by_email.get(email)
        )

        if stripe_record:
            u['subscription_status'] = stripe_record['subscription_status']
            u['subscription_period_end'] = stripe_record['subscription_period_end']
            u['subscription_cancel_at_period_end'] = stripe_record['subscription_cancel_at_period_end']
            u['stripe_subscription_id'] = stripe_record['stripe_subscription_id']
            if not cust_id and stripe_record['stripe_customer_id']:
                # Surface the linked Stripe customer even if our DB hasn't recorded it yet.
                u['stripe_customer_id'] = stripe_record['stripe_customer_id']
            u['_source'] = 'stripe_live'
        else:
            u['_source'] = 'db'
            # Degrade an "active" DB row whose period_end has passed.
            period_end = u.get('subscription_period_end')
            if u.get('subscription_status') in ('active', 'trialing') and period_end:
                pe = period_end if period_end.tzinfo else period_end.replace(tzinfo=timezone.utc)
                if pe < datetime.now(timezone.utc):
                    u['subscription_status'] = 'expired'

    # --- Append "ghost" Stripe customers we don't have user records for ---
    db_emails = {(u.get('email') or '').lower().strip() for u in users if u.get('email')}
    db_cust_ids = {u.get('stripe_customer_id') for u in users if u.get('stripe_customer_id')}
    for record in stripe_subs_by_email.values():
        if record['stripe_customer_email'] in db_emails:
            continue
        if record['stripe_customer_id'] in db_cust_ids:
            continue
        users.append({
            'id': f"stripe:{record['stripe_customer_id']}",
            'email': record['stripe_customer_email'],
            'name': None,
            'phone_number': None,
            'stripe_customer_id': record['stripe_customer_id'],
            'created_at': None,
            'last_login_at': None,
            'login_count': 0,
            'prompt_count': 0,
            'subscription_status': record['subscription_status'],
            'subscription_period_end': record['subscription_period_end'],
            'subscription_cancel_at_period_end': record['subscription_cancel_at_period_end'],
            'stripe_subscription_id': record['stripe_subscription_id'],
            '_source': 'stripe_only_no_db_user',
        })

    if stripe_error:
        # Make the failure visible in the response so the admin knows the
        # count fell back to the (possibly stale) DB.
        for u in users:
            u.setdefault('_stripe_fetch_error', stripe_error)

    return users


def check_user_has_access(email: str) -> dict:
    """
    Check if user has access (either admin or active subscription).
    Returns dict with access status and details.
    """
    from .admin import ADMIN_EMAILS

    # Check if admin
    if email.lower() in [e.lower() for e in ADMIN_EMAILS]:
        return {
            'has_access': True,
            'is_admin': True,
            'subscription': None
        }

    # Get user
    user = get_user_by_email(email)
    if not user:
        return {
            'has_access': False,
            'is_admin': False,
            'subscription': None,
            'reason': 'User not found'
        }

    # Check subscription
    sub = get_subscription(user['id'])
    if sub:
        return {
            'has_access': True,
            'is_admin': False,
            'subscription': sub
        }

    return {
        'has_access': False,
        'is_admin': False,
        'subscription': None,
        'reason': 'No active subscription'
    }


def update_user_phone(email: str, phone_number: str):
    """Update user's phone number."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE users SET phone_number = %s, updated_at = NOW()
        WHERE email = %s
    """, (phone_number, email.lower()))
    conn.commit()
    cur.close()
    conn.close()


def get_user_phone(email: str) -> str:
    """Get user's phone number."""
    user = get_user_by_email(email)
    return user.get('phone_number') if user else None


def create_trial_subscription(user_id: str, trial_days: int = 3):
    """Create a trial subscription for a new user (3 days by default)."""
    from datetime import datetime, timedelta

    conn = get_connection()
    cur = get_cursor(conn)

    # Check if user already has any subscription (active or not)
    cur.execute("""
        SELECT id FROM subscriptions WHERE user_id = %s LIMIT 1
    """, (user_id,))
    existing = cur.fetchone()

    if existing:
        cur.close()
        conn.close()
        return None  # User already had a subscription, no trial

    # Create trial subscription
    now = datetime.utcnow()
    trial_end = now + timedelta(days=trial_days)

    cur.execute("""
        INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
    """, (user_id, f'trial_{user_id}', 'trialing', now, trial_end))
    sub = cur.fetchone()

    # Mark user as no longer new
    cur.execute("""
        UPDATE users SET is_new_user = FALSE, updated_at = NOW()
        WHERE id = %s
    """, (user_id,))

    conn.commit()
    cur.close()
    conn.close()
    return dict(sub) if sub else None


def is_user_eligible_for_trial(email: str) -> bool:
    """Check if user is eligible for trial (new user who never had subscription)."""
    user = get_user_by_email(email)
    if not user:
        return True  # New user, will be created

    # Check if user is marked as new
    if not user.get('is_new_user', False):
        return False

    # Check if user ever had a subscription
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM subscriptions WHERE user_id = %s
    """, (user['id'],))
    count = cur.fetchone()[0]
    cur.close()
    conn.close()

    return count == 0


def get_or_create_user_with_trial(email: str, name: str = None, auth_provider: str = None, auth_provider_id: str = None):
    """
    Get existing user or create new one.
    For new users, automatically creates a 3-day trial subscription.
    """
    conn = get_connection()
    cur = get_cursor(conn)

    # Check if user exists
    cur.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
    user = cur.fetchone()

    is_brand_new = False
    if not user:
        # Create new user with is_new_user=True
        cur.execute("""
            INSERT INTO users (email, name, auth_provider, auth_provider_id, is_new_user)
            VALUES (%s, %s, %s, %s, TRUE)
            RETURNING *
        """, (email.lower(), name, auth_provider, auth_provider_id))
        user = cur.fetchone()
        is_brand_new = True
        conn.commit()

    cur.close()
    conn.close()

    user_dict = dict(user) if user else None

    # Auto-create trial for brand new users
    if is_brand_new and user_dict:
        try:
            trial = create_trial_subscription(str(user_dict['id']), trial_days=3)
            if trial:
                logging.info(f"Auto-created 3-day trial for new user: {email}")
            else:
                logging.warning(f"Trial creation returned None for new user: {email}")
        except Exception as e:
            logging.error(f"Failed to create trial for new user {email}: {e}")

    return user_dict


def fix_users_without_subscription(trial_days: int = 3) -> dict:
    """
    Find all users with no subscription record and create a trial for them.
    Returns a summary of what was fixed.
    """
    from datetime import datetime, timedelta

    conn = get_connection()
    cur = get_cursor(conn)

    # Find users who have NO subscription at all
    cur.execute("""
        SELECT u.id, u.email, u.created_at
        FROM users u
        LEFT JOIN subscriptions s ON s.user_id = u.id
        WHERE s.id IS NULL
        ORDER BY u.created_at DESC
    """)
    users_without_sub = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()

    fixed = []
    skipped = []

    for user in users_without_sub:
        user_id = str(user['id'])
        email = user['email']

        # Skip admin emails
        try:
            from .admin import is_admin as check_admin
            if check_admin(email):
                skipped.append({'email': email, 'reason': 'admin'})
                continue
        except Exception:
            pass

        # Create trial
        trial = create_trial_subscription(user_id, trial_days=trial_days)
        if trial:
            fixed.append({'email': email, 'trial_end': trial['current_period_end'].isoformat() if trial.get('current_period_end') else None})
            logging.info(f"Fixed: Created {trial_days}-day trial for {email}")
        else:
            skipped.append({'email': email, 'reason': 'trial creation failed or already has subscription'})

    return {
        'total_without_subscription': len(users_without_sub),
        'fixed': len(fixed),
        'skipped': len(skipped),
        'fixed_users': fixed,
        'skipped_users': skipped
    }


def save_market_summary(summary_date: str, summary_text: str):
    """Upsert a market summary for a given date."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        INSERT INTO market_summaries (summary_date, summary_text)
        VALUES (%s, %s)
        ON CONFLICT (summary_date) DO UPDATE SET summary_text = EXCLUDED.summary_text, generated_at = NOW()
        RETURNING *
    """, (summary_date, summary_text))
    row = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return dict(row) if row else None


def get_market_summaries(limit: int = 5):
    """Return the latest N market summaries, newest first."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT summary_date, summary_text, generated_at
        FROM market_summaries
        ORDER BY summary_date DESC
        LIMIT %s
    """, (limit,))
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def cleanup_old_summaries(keep_days: int = 5):
    """Delete market summaries older than keep_days days."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        DELETE FROM market_summaries
        WHERE summary_date < CURRENT_DATE - INTERVAL '%s days'
    """, (keep_days,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return deleted


def get_all_summary_dates():
    """Return all summary dates in the database."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("SELECT summary_date FROM market_summaries ORDER BY summary_date DESC")
    rows = [row['summary_date'] for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def delete_summaries_by_dates(dates):
    """Delete market summaries for specific dates. Returns count deleted."""
    if not dates:
        return 0
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM market_summaries WHERE summary_date = ANY(%s::date[])",
        (dates,)
    )
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return deleted


def get_paid_subscribers_for_email():
    """Get all paid/trialing subscribers who have not opted out of emails."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT u.email, u.name
        FROM users u
        JOIN subscriptions s ON s.user_id = u.id
        WHERE s.status IN ('active', 'trialing')
          AND s.current_period_end > NOW()
          AND (u.email_opt_out IS NOT TRUE)
        GROUP BY u.email, u.name
    """)
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def update_email_opt_out(email: str, opt_out: bool):
    """Update user's email opt-out preference."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        UPDATE users SET email_opt_out = %s, updated_at = NOW()
        WHERE email = %s
    """, (opt_out, email.lower()))
    conn.commit()
    cur.close()
    conn.close()


def log_email_send(email: str, send_date: str, status: str, error_message: str = None):
    """Log an email send attempt to email_log table."""
    conn = get_connection()
    cur = conn.cursor()
    # Look up user_id by email
    cur.execute("SELECT id FROM users WHERE email = %s", (email.lower(),))
    row = cur.fetchone()
    user_id = row[0] if row else None
    cur.execute("""
        INSERT INTO email_log (user_id, email, send_date, status, error_message)
        VALUES (%s, %s, %s, %s, %s)
    """, (user_id, email.lower(), send_date, status, error_message))
    conn.commit()
    cur.close()
    conn.close()


def get_email_subscribers_report():
    """Get all active/trialing subscribers with subscription info, opt-out status, and latest email delivery."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT
            u.id, u.email, u.name, u.email_opt_out,
            s.status AS subscription_status,
            s.current_period_end,
            el.send_date AS last_send_date,
            el.status AS last_status,
            el.error_message AS last_error
        FROM users u
        JOIN subscriptions s ON s.user_id = u.id
            AND s.status IN ('active', 'trialing')
            AND s.current_period_end > NOW()
        LEFT JOIN LATERAL (
            SELECT send_date, status, error_message
            FROM email_log
            WHERE email_log.email = u.email
            ORDER BY created_at DESC
            LIMIT 1
        ) el ON true
        ORDER BY u.email
    """)
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


def get_email_telemetry(days: int = 30):
    """Get daily aggregated email send stats for the last N days."""
    conn = get_connection()
    cur = get_cursor(conn)
    cur.execute("""
        SELECT
            send_date,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'sent') AS sent,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed
        FROM email_log
        WHERE send_date >= CURRENT_DATE - %s
        GROUP BY send_date
        ORDER BY send_date DESC
    """, (days,))
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    conn.close()
    return rows


# ── Investment Portfolio (PostgreSQL) ──────────────────────────────────────

def get_investment_portfolio():
    """Get the full investment portfolio (stocks + buys) as the JSON shape the frontend expects."""
    conn = get_connection()
    cur = get_cursor(conn)

    cur.execute("SELECT * FROM investment_stocks ORDER BY id")
    stocks_rows = [dict(r) for r in cur.fetchall()]

    cur.execute("SELECT * FROM investment_buys ORDER BY month")
    buys_rows = [dict(r) for r in cur.fetchall()]

    cur.close()
    conn.close()

    # Group buys by stock_id
    buys_by_stock = {}
    for b in buys_rows:
        sid = b['stock_id']
        buys_by_stock.setdefault(sid, []).append({
            'month': b['month'],
            'date': b['buy_date'].isoformat() if hasattr(b['buy_date'], 'isoformat') else str(b['buy_date']),
            'shares': float(b['shares']),
            'pricePerShare': float(b['price_per_share']),
            'amount': float(b['amount']),
            'locked': b['locked']
        })

    stocks = []
    for s in stocks_rows:
        stocks.append({
            'id': s['id'],
            'ticker': s['ticker'],
            'name': s['name'],
            'addedQuarter': s['added_quarter'],
            'addedMonth': s['added_month'],
            'currentPrice': 0,
            'monthlyBuys': buys_by_stock.get(s['id'], [])
        })

    return stocks


def save_investment_portfolio(stocks_data):
    """
    Replace the entire portfolio with the given data.
    Returns the list of changes (added/removed stocks, new buys) for email notifications.
    """
    conn = get_connection()
    cur = get_cursor(conn)

    # Load current state for diff
    cur.execute("SELECT id, ticker FROM investment_stocks")
    old_tickers = {r['ticker']: r['id'] for r in cur.fetchall()}

    cur.execute("SELECT stock_id, month FROM investment_buys")
    old_buys = set()
    for r in cur.fetchall():
        old_buys.add((r['stock_id'], r['month']))

    # Rebuild tables
    cur.execute("DELETE FROM investment_buys")
    cur.execute("DELETE FROM investment_stocks")

    changes = []
    new_tickers = set()

    for s in stocks_data:
        ticker = s.get('ticker', '').upper()
        new_tickers.add(ticker)

        cur.execute("""
            INSERT INTO investment_stocks (ticker, name, added_quarter, added_month)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (ticker, s.get('name', ''), s.get('addedQuarter', ''), s.get('addedMonth', '')))
        new_id = cur.fetchone()['id']

        if ticker not in old_tickers:
            changes.append(f"New stock added: {ticker} ({s.get('name', '')})")

        for buy in s.get('monthlyBuys', []):
            cur.execute("""
                INSERT INTO investment_buys (stock_id, month, buy_date, shares, price_per_share, amount, locked)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                new_id,
                buy.get('month', ''),
                buy.get('date', ''),
                buy.get('shares', 0),
                buy.get('pricePerShare', 0),
                buy.get('amount', 0),
                buy.get('locked', True)
            ))

            old_stock_id = old_tickers.get(ticker)
            if old_stock_id and (old_stock_id, buy.get('month', '')) not in old_buys:
                changes.append(f"New buy recorded: {ticker} — {buy.get('shares', 0)} shares @ ${buy.get('pricePerShare', 0):.2f} ({buy.get('month', '')})")

    # Check for removed stocks
    for old_ticker in old_tickers:
        if old_ticker not in new_tickers:
            changes.append(f"Stock removed: {old_ticker}")

    conn.commit()
    cur.close()
    conn.close()
    return changes


def get_investment_settings():
    """Get investment settings (lightweight — kept in Redis)."""
    from .cache import get_redis_client
    import json as _json
    client = get_redis_client()
    if client:
        try:
            data = client.get('investments:settings:v2')
            if data:
                return _json.loads(data)
        except Exception:
            pass
    return {'monthlyInvestment': 5000, 'startDate': '2026-01', 'endDate': '2028-12'}


def save_investment_settings(settings):
    """Save investment settings to Redis."""
    from .cache import get_redis_client
    import json as _json
    client = get_redis_client()
    if client:
        try:
            client.set('investments:settings:v2', _json.dumps(settings))
            return True
        except Exception:
            pass
    return False
