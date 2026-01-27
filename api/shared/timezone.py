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


def is_dst(dt: datetime = None) -> bool:
    """
    Check if a given date is in Daylight Saving Time (PDT).
    DST in US: Second Sunday of March to First Sunday of November.
    """
    if dt is None:
        dt = datetime.utcnow()

    year = dt.year

    # Second Sunday of March
    march_start = datetime(year, 3, 1)
    days_to_sunday = (6 - march_start.weekday()) % 7
    second_sunday_march = march_start + timedelta(days=days_to_sunday + 7)
    dst_start = second_sunday_march.replace(hour=2)  # 2 AM local time

    # First Sunday of November
    november_start = datetime(year, 11, 1)
    days_to_sunday = (6 - november_start.weekday()) % 7
    first_sunday_november = november_start + timedelta(days=days_to_sunday)
    dst_end = first_sunday_november.replace(hour=2)  # 2 AM local time

    # Check if we're in DST period
    return dst_start <= dt < dst_end


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
