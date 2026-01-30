"""
Health Check API - Admin-only endpoint for system status monitoring.
Returns real-time status of all system components, API endpoints, and recent errors.
"""

import json
import os
import sys
import base64
import logging
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
import azure.functions as func

# Add shared module to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.admin import is_admin, is_beta_mode, ADMIN_EMAILS
from shared.cache import get_redis_client, get_cached, get_recent_errors
from shared.timezone import now_pst

# Cache key and TTL for health check results
HEALTH_CACHE_KEY = "health:check:result"
HEALTH_CACHE_TTL = 30  # 30 seconds

# Timeout for individual checks (in seconds)
CHECK_TIMEOUT = 5


def get_user_from_auth(req):
    """Extract user info from Azure Static Web Apps auth header."""
    client_principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not client_principal:
        return None
    try:
        decoded = base64.b64decode(client_principal)
        return json.loads(decoded)
    except:
        return None


def check_postgres():
    """Check PostgreSQL database connection and latency."""
    start = time.time()
    try:
        from shared.database import get_connection
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        latency = int((time.time() - start) * 1000)
        return {
            'name': 'PostgreSQL Database',
            'status': 'healthy',
            'latency_ms': latency,
            'details': 'Connection successful'
        }
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return {
            'name': 'PostgreSQL Database',
            'status': 'unhealthy',
            'latency_ms': latency,
            'details': str(e)
        }


def check_redis():
    """Check Redis cache connection and latency."""
    start = time.time()
    try:
        client = get_redis_client()
        if not client:
            return {
                'name': 'Redis Cache',
                'status': 'unhealthy',
                'latency_ms': 0,
                'details': 'Redis not configured'
            }
        client.ping()
        latency = int((time.time() - start) * 1000)
        return {
            'name': 'Redis Cache',
            'status': 'healthy',
            'latency_ms': latency,
            'details': 'Connection successful'
        }
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return {
            'name': 'Redis Cache',
            'status': 'unhealthy',
            'latency_ms': latency,
            'details': str(e)
        }


def check_polygon():
    """Check Polygon.io API with a lightweight call."""
    start = time.time()
    try:
        import urllib.request
        import ssl

        api_key = os.environ.get('POLYGON_API_KEY', '')
        if not api_key:
            return {
                'name': 'Polygon.io',
                'status': 'unhealthy',
                'latency_ms': 0,
                'details': 'API key not configured'
            }

        # Use market status endpoint (lightweight)
        url = f"https://api.polygon.io/v1/marketstatus/now?apiKey={api_key}"
        context = ssl.create_default_context()
        req = urllib.request.Request(url, headers={'User-Agent': 'IndustryRunners/1.0'})

        with urllib.request.urlopen(req, timeout=CHECK_TIMEOUT, context=context) as response:
            data = json.loads(response.read().decode())
            latency = int((time.time() - start) * 1000)

            market_status = data.get('market', 'unknown')
            return {
                'name': 'Polygon.io',
                'status': 'healthy',
                'latency_ms': latency,
                'details': f'Market: {market_status}',
                'market_status': market_status
            }

    except Exception as e:
        latency = int((time.time() - start) * 1000)
        return {
            'name': 'Polygon.io',
            'status': 'unhealthy',
            'latency_ms': latency,
            'details': str(e)
        }


def check_anthropic():
    """Check if Anthropic API key is configured (no live call to save cost)."""
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if api_key:
        return {
            'name': 'Anthropic (Claude)',
            'status': 'healthy',
            'latency_ms': None,
            'details': 'API key configured'
        }
    return {
        'name': 'Anthropic (Claude)',
        'status': 'unhealthy',
        'latency_ms': None,
        'details': 'API key not configured'
    }


def check_stripe():
    """Check if Stripe API key is configured (no live call)."""
    api_key = os.environ.get('STRIPE_SECRET_KEY', '')
    if api_key:
        return {
            'name': 'Stripe',
            'status': 'healthy',
            'latency_ms': None,
            'details': 'Secret key configured'
        }
    return {
        'name': 'Stripe',
        'status': 'unhealthy',
        'latency_ms': None,
        'details': 'Secret key not configured'
    }


def check_api_cache_status(cache_key: str, endpoint: str, expected_ttl: int):
    """Check the cache status for a specific API endpoint."""
    try:
        client = get_redis_client()
        if not client:
            return {
                'endpoint': endpoint,
                'status': 'unknown',
                'cached': False,
                'ttl': None,
                'last_refresh': None
            }

        # Check if cache exists
        cached_data = client.get(cache_key)
        ttl = client.ttl(cache_key)

        if cached_data:
            try:
                data = json.loads(cached_data)
                timestamp = data.get('timestamp')
                last_refresh = None
                if timestamp:
                    if isinstance(timestamp, int):
                        # Timestamp in milliseconds
                        last_refresh = datetime.fromtimestamp(timestamp / 1000).strftime('%I:%M %p')
                    elif isinstance(timestamp, str):
                        last_refresh = timestamp
            except:
                last_refresh = None

            return {
                'endpoint': endpoint,
                'status': 'healthy',
                'cached': True,
                'ttl': ttl if ttl > 0 else expected_ttl,
                'expected_ttl': expected_ttl,
                'last_refresh': last_refresh
            }
        else:
            return {
                'endpoint': endpoint,
                'status': 'degraded',
                'cached': False,
                'ttl': None,
                'expected_ttl': expected_ttl,
                'last_refresh': None
            }

    except Exception as e:
        return {
            'endpoint': endpoint,
            'status': 'unhealthy',
            'cached': False,
            'ttl': None,
            'expected_ttl': expected_ttl,
            'last_refresh': None,
            'error': str(e)
        }


def get_market_status():
    """Determine if the market is open based on time."""
    from datetime import timedelta

    try:
        utc_now = datetime.utcnow()
        et_offset = timedelta(hours=-5)  # EST
        et_now = utc_now + et_offset

        # Weekend check
        if et_now.weekday() >= 5:
            return 'closed'

        # Market hours: 9:30 AM - 4:00 PM ET
        market_open = et_now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = et_now.replace(hour=16, minute=0, second=0, microsecond=0)

        if market_open <= et_now <= market_close:
            return 'open'
        elif et_now < market_open:
            return 'pre-market'
        else:
            return 'after-hours'

    except:
        return 'unknown'


def run_health_checks():
    """Run all health checks in parallel."""
    start_time = time.time()
    results = {
        'infrastructure': [],
        'external_services': [],
        'api_endpoints': [],
        'recent_errors': [],
        'system_info': {}
    }

    # Run infrastructure checks in parallel
    with ThreadPoolExecutor(max_workers=5) as executor:
        postgres_future = executor.submit(check_postgres)
        redis_future = executor.submit(check_redis)
        polygon_future = executor.submit(check_polygon)

        # Collect results with timeout handling
        try:
            results['infrastructure'].append(postgres_future.result(timeout=CHECK_TIMEOUT))
        except FuturesTimeoutError:
            results['infrastructure'].append({
                'name': 'PostgreSQL Database',
                'status': 'unhealthy',
                'latency_ms': CHECK_TIMEOUT * 1000,
                'details': 'Check timed out'
            })

        try:
            results['infrastructure'].append(redis_future.result(timeout=CHECK_TIMEOUT))
        except FuturesTimeoutError:
            results['infrastructure'].append({
                'name': 'Redis Cache',
                'status': 'unhealthy',
                'latency_ms': CHECK_TIMEOUT * 1000,
                'details': 'Check timed out'
            })

        # External services
        try:
            results['external_services'].append(polygon_future.result(timeout=CHECK_TIMEOUT))
        except FuturesTimeoutError:
            results['external_services'].append({
                'name': 'Polygon.io',
                'status': 'unhealthy',
                'latency_ms': CHECK_TIMEOUT * 1000,
                'details': 'Check timed out'
            })

    # Config-only checks (instant)
    results['external_services'].append(check_anthropic())
    results['external_services'].append(check_stripe())

    # API endpoint cache checks
    api_checks = [
        ('quotes:*', '/api/quotes', 30),
        ('focusstocks:cache', '/api/focusstocks', 300),
        ('breadth:realtime', '/api/breadth', 300),
        ('breadth-daily:cache', '/api/breadth-daily', 3600),
        ('sector-rotation:cache', '/api/sector-rotation', 3600),
        ('daytrade:cache', '/api/daytrade', 300),
    ]

    for cache_key, endpoint, ttl in api_checks:
        results['api_endpoints'].append(check_api_cache_status(cache_key, endpoint, ttl))

    # Get recent errors
    results['recent_errors'] = get_recent_errors(10)

    # Extract market status from Polygon check if available
    market_status = 'unknown'
    for service in results['external_services']:
        if service.get('name') == 'Polygon.io' and service.get('market_status'):
            market_status = service['market_status']
            break

    # Fall back to calculated market status
    if market_status == 'unknown':
        market_status = get_market_status()

    # System info
    results['system_info'] = {
        'beta_mode': is_beta_mode(),
        'market_status': market_status,
        'timestamp': now_pst().strftime('%Y-%m-%d %I:%M:%S %p PST'),
        'check_duration_ms': int((time.time() - start_time) * 1000)
    }

    # Calculate overall status
    all_checks = results['infrastructure'] + results['external_services']
    unhealthy_count = sum(1 for c in all_checks if c.get('status') == 'unhealthy')
    degraded_count = sum(1 for c in all_checks if c.get('status') == 'degraded')

    if unhealthy_count > 0:
        results['overall_status'] = 'unhealthy'
    elif degraded_count > 0:
        results['overall_status'] = 'degraded'
    else:
        results['overall_status'] = 'healthy'

    return results


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Get authenticated user
        auth_user = get_user_from_auth(req)
        if not auth_user:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized - Authentication required'}),
                status_code=401,
                mimetype='application/json'
            )

        user_email = auth_user.get('userDetails', '').lower()

        # Check if admin
        if not is_admin(user_email):
            return func.HttpResponse(
                json.dumps({'error': 'Access denied - Admin only'}),
                status_code=403,
                mimetype='application/json'
            )

        # Check for refresh parameter
        refresh = req.params.get('refresh', '').lower() == 'true'

        # Try to get cached results (unless refresh requested)
        if not refresh:
            cached = get_cached(HEALTH_CACHE_KEY)
            if cached:
                cached['cached'] = True
                return func.HttpResponse(
                    json.dumps(cached),
                    mimetype='application/json'
                )

        # Run health checks
        results = run_health_checks()
        results['cached'] = False

        # Cache the results
        from shared.cache import set_cached
        set_cached(HEALTH_CACHE_KEY, results, HEALTH_CACHE_TTL)

        return func.HttpResponse(
            json.dumps(results),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Error in health check endpoint: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
