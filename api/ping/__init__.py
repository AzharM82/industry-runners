"""
Simple ping endpoint to verify API is working.
No authentication required.
"""

import json
import azure.functions as func
from datetime import datetime


def main(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps({
            'status': 'ok',
            'message': 'API is working',
            'timestamp': datetime.utcnow().isoformat()
        }),
        status_code=200,
        mimetype='application/json'
    )
