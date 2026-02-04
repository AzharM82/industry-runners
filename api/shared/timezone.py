"""
Timezone utilities for StockPro AI.
All times should be in Pacific Standard Time (PST/PDT) for consistency.
"""

from datetime import datetime, timedelta
from typing import Optional

# PST is UTC-8, PDT is UTC-7
# We'll use a simple offset approach since pytz may not be available
PST_OFFSET_HOURS = -8
PDT_OFFSET_HOURS = -7


def is_dst(utc_dt: datetime = None) -> bool:
    """
    Check if a given UTC datetime falls within US Pacific Daylight Time (PDT).
    DST in US: Second Sunday of March 2AM PST to First Sunday of November 2AM PDT.

    Args:
        utc_dt: A UTC datetime. If None, uses current UTC time.

    Returns:
        True if PDT is in effect, False if PST.
    """
    if utc_dt is None:
        utc_dt = datetime.utcnow()

    year = utc_dt.year

    # Second Sunday of March at 2 AM PST = 10 AM UTC
    march_start = datetime(year, 3, 1)
    days_to_sunday = (6 - march_start.weekday()) % 7
    second_sunday_march = march_start + timedelta(days=days_to_sunday + 7)
    # DST starts at 2 AM PST = 10 AM UTC (PST is UTC-8)
    dst_start_utc = second_sunday_march.replace(hour=10, minute=0, second=0)

    # First Sunday of November at 2 AM PDT = 9 AM UTC
    november_start = datetime(year, 11, 1)
    days_to_sunday = (6 - november_start.weekday()) % 7
    first_sunday_november = november_start + timedelta(days=days_to_sunday)
    # DST ends at 2 AM PDT = 9 AM UTC (PDT is UTC-7)
    dst_end_utc = first_sunday_november.replace(hour=9, minute=0, second=0)

    # Check if we're in DST period (comparing UTC to UTC)
    return dst_start_utc <= utc_dt < dst_end_utc


def get_pst_offset() -> int:
    """Get the current PST/PDT offset in hours."""
    if is_dst():
        return PDT_OFFSET_HOURS  # -7 during DST (PDT)
    return PST_OFFSET_HOURS  # -8 during standard time (PST)


def now_pst() -> datetime:
    """Get the current datetime in Pacific Time (PST/PDT)."""
    utc_now = datetime.utcnow()
    offset = get_pst_offset()
    return utc_now + timedelta(hours=offset)


def today_pst() -> str:
    """Get today's date string (YYYY-MM-DD) in Pacific Time."""
    return now_pst().strftime('%Y-%m-%d')


def now_pst_timestamp() -> int:
    """Get current timestamp in milliseconds (PST-aware)."""
    return int(now_pst().timestamp() * 1000)


def utc_to_pst(utc_dt: datetime) -> datetime:
    """Convert a UTC datetime to Pacific Time."""
    offset = get_pst_offset()
    return utc_dt + timedelta(hours=offset)


def format_pst_datetime(dt: datetime = None, fmt: str = '%Y-%m-%d %H:%M:%S') -> str:
    """Format a datetime in PST. If no datetime provided, uses current PST time."""
    if dt is None:
        dt = now_pst()
    return dt.strftime(fmt)
