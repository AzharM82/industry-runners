"""
Redis caching module for breadth indicators.
Provides caching and historical data storage.

Environment variables:
- REDIS_CONNECTION_STRING: Azure Redis Cache connection string
  Format: "your-redis.redis.cache.windows.net:6380,password=xxx,ssl=True,abortConnect=False"

If Redis is not configured, caching is disabled and functions return None/empty.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

# Try to import redis, gracefully handle if not available
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logging.warning("Redis package not available, caching disabled")

# Redis connection
_redis_client = None

# Cache TTLs (in seconds)
CACHE_TTL_REALTIME = 5 * 60  # 5 minutes for real-time data
CACHE_TTL_DAILY = 60 * 60  # 1 hour for daily Finviz data
HISTORY_DAYS = 5  # Number of days to keep in history


def get_redis_client():
    """Get or create Redis client singleton."""
    global _redis_client

    if not REDIS_AVAILABLE:
        return None

    if _redis_client is not None:
        return _redis_client

    connection_string = os.environ.get('REDIS_CONNECTION_STRING', '')
    if not connection_string:
        logging.info("REDIS_CONNECTION_STRING not configured, caching disabled")
        return None

    try:
        # Parse Azure Redis connection string
        # Format: host:port,password=xxx,ssl=True,abortConnect=False
        parts = connection_string.split(',')
        host_port = parts[0].split(':')
        host = host_port[0]
        port = int(host_port[1]) if len(host_port) > 1 else 6380

        password = None
        use_ssl = True

        for part in parts[1:]:
            if part.startswith('password='):
                password = part.split('=', 1)[1]
            elif part.startswith('ssl='):
                use_ssl = part.split('=')[1].lower() == 'true'

        _redis_client = redis.Redis(
            host=host,
            port=port,
            password=password,
            ssl=use_ssl,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5
        )

        # Test connection
        _redis_client.ping()
        logging.info(f"Connected to Redis at {host}:{port}")
        return _redis_client

    except Exception as e:
        logging.error(f"Failed to connect to Redis: {e}")
        _redis_client = None
        return None


def get_cached(key: str) -> Optional[Dict[str, Any]]:
    """Get cached data by key. Returns None if not cached or Redis unavailable."""
    client = get_redis_client()
    if not client:
        return None

    try:
        data = client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logging.error(f"Redis get error for {key}: {e}")

    return None


def set_cached(key: str, data: Dict[str, Any], ttl: int = CACHE_TTL_REALTIME) -> bool:
    """Set cached data with TTL. Returns True if successful."""
    client = get_redis_client()
    if not client:
        return False

    try:
        client.setex(key, ttl, json.dumps(data))
        return True
    except Exception as e:
        logging.error(f"Redis set error for {key}: {e}")
        return False


def save_daily_snapshot(key_prefix: str, data: Dict[str, Any], date: str = None) -> bool:
    """
    Save a daily snapshot for historical tracking.
    Key format: {key_prefix}:history:{date}
    Also maintains a sorted set of dates for easy retrieval.
    """
    client = get_redis_client()
    if not client:
        return False

    if date is None:
        date = datetime.now().strftime('%Y-%m-%d')

    try:
        # Save the snapshot
        snapshot_key = f"{key_prefix}:history:{date}"
        client.set(snapshot_key, json.dumps(data))

        # Add date to the sorted set (score = timestamp for ordering)
        dates_key = f"{key_prefix}:history:dates"
        timestamp = datetime.strptime(date, '%Y-%m-%d').timestamp()
        client.zadd(dates_key, {date: timestamp})

        # Clean up old entries (keep only last 30 days)
        cutoff = (datetime.now() - timedelta(days=30)).timestamp()
        client.zremrangebyscore(dates_key, '-inf', cutoff)

        logging.info(f"Saved daily snapshot for {key_prefix} on {date}")
        return True

    except Exception as e:
        logging.error(f"Redis save_daily_snapshot error: {e}")
        return False


def get_history(key_prefix: str, days: int = HISTORY_DAYS) -> List[Dict[str, Any]]:
    """
    Get historical snapshots for the last N days.
    Returns list of {date, data} objects, newest first.
    """
    client = get_redis_client()
    if not client:
        return []

    try:
        # Get the last N dates from the sorted set
        dates_key = f"{key_prefix}:history:dates"
        dates = client.zrevrange(dates_key, 0, days - 1)

        history = []
        for date in dates:
            snapshot_key = f"{key_prefix}:history:{date}"
            data = client.get(snapshot_key)
            if data:
                history.append({
                    'date': date,
                    'data': json.loads(data)
                })

        return history

    except Exception as e:
        logging.error(f"Redis get_history error: {e}")
        return []


def should_save_daily_snapshot(key_prefix: str) -> bool:
    """
    Check if we should save a daily snapshot (only once per day).
    Returns True if no snapshot exists for today.
    """
    client = get_redis_client()
    if not client:
        return False

    today = datetime.now().strftime('%Y-%m-%d')
    snapshot_key = f"{key_prefix}:history:{today}"

    try:
        return not client.exists(snapshot_key)
    except Exception as e:
        logging.error(f"Redis check error: {e}")
        return False
