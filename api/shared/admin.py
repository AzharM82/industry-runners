"""
Admin configuration for StockPro AI
"""

# =============================================================================
# BETA MODE: Set to True to allow all users access without subscription
# This bypasses payment requirements and gives everyone limited free prompts
# Set back to False when launching with real subscriptions
# =============================================================================
BETA_MODE = False
BETA_PROMPT_LIMIT = 3  # Free prompts per type during beta

# Admin emails that bypass payment requirements
ADMIN_EMAILS = [
    'reachazure37@gmail.com',
    'reachazhar@hotmail.com',
]

# Monthly limit per prompt type (for subscribers after beta)
MONTHLY_LIMIT = 30

# Admin users get unlimited prompts
ADMIN_MONTHLY_LIMIT = 999999

def is_admin(email: str) -> bool:
    """Check if email is an admin."""
    if not email:
        return False
    return email.lower() in [e.lower() for e in ADMIN_EMAILS]

def is_beta_mode() -> bool:
    """Check if beta mode is enabled."""
    return BETA_MODE

def get_monthly_limit(email: str) -> int:
    """Get monthly limit for a user."""
    if is_admin(email):
        return ADMIN_MONTHLY_LIMIT
    if BETA_MODE:
        return BETA_PROMPT_LIMIT
    return MONTHLY_LIMIT
