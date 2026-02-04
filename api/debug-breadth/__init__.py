"""
Debug endpoint for breadth history.
Shows raw Redis data and timezone info for diagnosing 0/0 issues.
"""

import json
import os
import sys
import logging
import azure.functions as func

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.cache import get_redis_client, get_history
from shared.timezone import now_pst, today_pst, is_dst, get_pst_offset
from datetime import datetime


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        client = get_redis_client()

        result = {
            'timezone_info': {
                'utc_now': datetime.utcnow().isoformat(),
                'pst_now': now_pst().isoformat(),
                'today_pst': today_pst(),
                'is_dst': is_dst(),
                'pst_offset': get_pst_offset()
            },
            'redis_connected': client is not None,
            'daily_history': [],
            'realtime_history': [],
            'raw_keys': []
        }

        if not client:
            result['error'] = 'Redis not connected'
            return func.HttpResponse(
                json.dumps(result, indent=2),
                mimetype="application/json"
            )

        # Get all history dates stored in Redis
        daily_dates_key = 'breadth:daily:history:dates'
        realtime_dates_key = 'breadth:realtime:history:dates'

        # Get stored dates (sorted set)
        daily_dates = client.zrevrange(daily_dates_key, 0, 10)  # Last 10 dates
        realtime_dates = client.zrevrange(realtime_dates_key, 0, 10)

        result['stored_daily_dates'] = daily_dates
        result['stored_realtime_dates'] = realtime_dates

        # Get the raw data for each daily date
        for date in daily_dates:
            key = f'breadth:daily:history:{date}'
            data = client.get(key)
            if data:
                parsed = json.loads(data)
                result['daily_history'].append({
                    'date': date,
                    'key': key,
                    'highs': parsed.get('highs', {}),
                    'has_data': bool(parsed.get('highs', {}).get('new52WeekHigh'))
                })
            else:
                result['daily_history'].append({
                    'date': date,
                    'key': key,
                    'data': None,
                    'has_data': False
                })

        # Get the raw data for each realtime date
        for date in realtime_dates:
            key = f'breadth:realtime:history:{date}'
            data = client.get(key)
            if data:
                parsed = json.loads(data)
                primary = parsed.get('primary', {})
                result['realtime_history'].append({
                    'date': date,
                    'key': key,
                    'up4PlusToday': primary.get('up4PlusToday'),
                    'down4PlusToday': primary.get('down4PlusToday'),
                    'has_data': primary.get('up4PlusToday') is not None
                })
            else:
                result['realtime_history'].append({
                    'date': date,
                    'key': key,
                    'data': None,
                    'has_data': False
                })

        # Check current cached values
        daily_current = client.get('breadth:daily')
        if daily_current:
            parsed = json.loads(daily_current)
            result['current_daily_cache'] = {
                'date': parsed.get('date'),
                'cached': parsed.get('cached'),
                'highs': parsed.get('highs', {})
            }
        else:
            result['current_daily_cache'] = None

        return func.HttpResponse(
            json.dumps(result, indent=2),
            mimetype="application/json"
        )

    except Exception as e:
        import traceback
        return func.HttpResponse(
            json.dumps({
                'error': str(e),
                'traceback': traceback.format_exc()
            }, indent=2),
            status_code=500,
            mimetype="application/json"
        )
