"""
Database utilities for StockPro AI
"""

import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor

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
        auth_provider VARCHAR(50),
        auth_provider_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        is_admin BOOLEAN DEFAULT FALSE,
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

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, prompt_type, month_year);
    """

    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(schema_sql)
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
    return dict(sub) if sub else None

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
