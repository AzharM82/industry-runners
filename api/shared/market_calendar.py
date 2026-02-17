"""
US Stock Market Calendar — weekend and holiday detection.

NYSE/NASDAQ holidays through 2027. Update annually from:
https://www.nyse.com/markets/hours-calendars
"""

from datetime import date, datetime


# Fixed-date holidays: (month, day) → observed rules applied separately
# Variable holidays computed by helper functions below

def _mlk_day(year: int) -> date:
    """Third Monday of January."""
    d = date(year, 1, 1)
    # Find first Monday
    while d.weekday() != 0:
        d = d.replace(day=d.day + 1)
    # Third Monday = first Monday + 14 days
    return d.replace(day=d.day + 14)


def _presidents_day(year: int) -> date:
    """Third Monday of February."""
    d = date(year, 2, 1)
    while d.weekday() != 0:
        d = d.replace(day=d.day + 1)
    return d.replace(day=d.day + 14)


def _memorial_day(year: int) -> date:
    """Last Monday of May."""
    d = date(year, 5, 31)
    while d.weekday() != 0:
        d = d.replace(day=d.day - 1)
    return d


def _labor_day(year: int) -> date:
    """First Monday of September."""
    d = date(year, 9, 1)
    while d.weekday() != 0:
        d = d.replace(day=d.day + 1)
    return d


def _thanksgiving(year: int) -> date:
    """Fourth Thursday of November."""
    d = date(year, 11, 1)
    while d.weekday() != 3:  # Thursday
        d = d.replace(day=d.day + 1)
    return d.replace(day=d.day + 21)


def _good_friday(year: int) -> date:
    """Good Friday via anonymous Gregorian algorithm for Easter."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    easter = date(year, month, day)
    return easter.replace(day=easter.day - 2)


def _observed(d: date) -> date:
    """If holiday falls on Saturday, observe Friday. If Sunday, observe Monday."""
    if d.weekday() == 5:  # Saturday → Friday
        return d.replace(day=d.day - 1)
    if d.weekday() == 6:  # Sunday → Monday
        return d.replace(day=d.day + 1)
    return d


def get_market_holidays(year: int) -> set:
    """Return set of NYSE/NASDAQ holiday dates for a given year."""
    holidays = set()

    # New Year's Day
    holidays.add(_observed(date(year, 1, 1)))

    # Martin Luther King Jr. Day (always Monday)
    holidays.add(_mlk_day(year))

    # Presidents' Day (always Monday)
    holidays.add(_presidents_day(year))

    # Good Friday
    holidays.add(_good_friday(year))

    # Memorial Day (always Monday)
    holidays.add(_memorial_day(year))

    # Juneteenth National Independence Day
    holidays.add(_observed(date(year, 6, 19)))

    # Independence Day
    holidays.add(_observed(date(year, 7, 4)))

    # Labor Day (always Monday)
    holidays.add(_labor_day(year))

    # Thanksgiving Day (always Thursday)
    holidays.add(_thanksgiving(year))

    # Christmas Day
    holidays.add(_observed(date(year, 12, 25)))

    return holidays


# One-off closures not covered by the standard calendar
_SPECIAL_CLOSURES = {
    date(2025, 1, 9),   # National Day of Mourning for President Carter
}


def is_market_open(date_str: str) -> bool:
    """
    Check if the US stock market was open on the given date (YYYY-MM-DD).
    Returns False for weekends, holidays, and special closures.
    """
    d = datetime.strptime(date_str, '%Y-%m-%d').date()

    # Weekends
    if d.weekday() >= 5:
        return False

    # Special closures
    if d in _SPECIAL_CLOSURES:
        return False

    # Standard holidays
    holidays = get_market_holidays(d.year)
    if d in holidays:
        return False

    return True


def get_closure_reason(date_str: str) -> str:
    """Return a human-readable reason why the market was closed, or empty string if open."""
    d = datetime.strptime(date_str, '%Y-%m-%d').date()

    if d.weekday() == 5:
        return "Saturday"
    if d.weekday() == 6:
        return "Sunday"
    if d in _SPECIAL_CLOSURES:
        return "Special market closure"

    holidays = get_market_holidays(d.year)
    if d in holidays:
        return "US stock market holiday"

    return ""
