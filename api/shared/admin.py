"""
Admin configuration for StockPro AI
"""

# Admin emails that bypass payment requirements
ADMIN_EMAILS = [
    'reachazure37@gmail.com',
    'reachazhar@hotmail.com',
]

# Monthly limit per prompt type
MONTHLY_LIMIT = 30

# Admin users get unlimited prompts
ADMIN_MONTHLY_LIMIT = 999999

def is_admin(email: str) -> bool:
    """Check if email is an admin."""
    if not email:
        return False
    return email.lower() in [e.lower() for e in ADMIN_EMAILS]

def get_monthly_limit(email: str) -> int:
    """Get monthly limit for a user."""
    return ADMIN_MONTHLY_LIMIT if is_admin(email) else MONTHLY_LIMIT
