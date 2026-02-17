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

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, prompt_type, month_year);
    CREATE INDEX IF NOT EXISTS idx_user_logins_created ON user_logins(created_at);
    CREATE INDEX IF NOT EXISTS idx_user_logins_user ON user_logins(user_id);
    CREATE INDEX IF NOT EXISTS idx_market_summaries_date ON market_summaries(summary_date);
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
    """Get all users with their stats."""
    conn = get_connection()
    cur = get_cursor(conn)

    cur.execute("""
        SELECT
            u.id, u.email, u.name, u.created_at, u.last_login_at,
            COALESCE(l.login_count, 0) as login_count,
            COALESCE(p.prompt_count, 0) as prompt_count
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
        ORDER BY u.created_at DESC
    """)
    users = [dict(row) for row in cur.fetchall()]

    cur.close()
    conn.close()
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
