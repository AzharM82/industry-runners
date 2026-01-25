"""
Breadth History API - Returns historical breadth snapshots from Redis.
"""

import json
import os
import sys
import logging
import azure.functions as func

# Add shared module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_history, HISTORY_DAYS


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Get number of days from query parameter (default to HISTORY_DAYS)
        days = int(req.params.get('days', HISTORY_DAYS))
        days = min(days, 30)  # Cap at 30 days

        logging.info(f"Fetching breadth history for {days} days")

        # Get history for both realtime and daily data
        realtime_history = get_history('breadth:realtime', days)
        daily_history = get_history('breadth:daily', days)

        response = {
            'days': days,
            'realtime': realtime_history,
            'daily': daily_history
        }

        return func.HttpResponse(
            json.dumps(response),
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in breadth-history endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype="application/json"
        )
