"""
Track Login API - Records user login events for analytics.
Called by frontend when user accesses the dashboard.
"""

import json
import os
import base64
import logging
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_or_create_user_with_trial, record_login, init_schema


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


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        # Initialize schema (creates tables if needed)
        init_schema()

        # Get authenticated user
        auth_user = get_user_from_auth(req)
        if not auth_user:
            return func.HttpResponse(
                json.dumps({'error': 'Unauthorized'}),
                status_code=401,
                mimetype='application/json'
            )

        user_email = auth_user.get('userDetails', '').lower()
        user_name = user_email.split('@')[0]  # Use email prefix as name

        # Detect auth provider from identity provider field
        # Azure Static Web Apps sets identityProvider to 'google' or 'aad' (Microsoft)
        identity_provider = auth_user.get('identityProvider', 'google').lower()
        auth_provider = 'microsoft' if identity_provider == 'aad' else identity_provider

        # Get or create user in database (new users get is_new_user=True for trial eligibility)
        user = get_or_create_user_with_trial(
            email=user_email,
            name=user_name,
            auth_provider=auth_provider,
            auth_provider_id=auth_user.get('userId', '')
        )

        if not user:
            return func.HttpResponse(
                json.dumps({'error': 'Failed to get/create user'}),
                status_code=500,
                mimetype='application/json'
            )

        # Get IP and user agent for analytics
        ip_address = req.headers.get('X-Forwarded-For', '').split(',')[0].strip()
        user_agent = req.headers.get('User-Agent', '')[:500]  # Limit length

        # Record the login
        record_login(
            user_id=str(user['id']),
            email=user_email,
            ip_address=ip_address,
            user_agent=user_agent
        )

        return func.HttpResponse(
            json.dumps({
                'success': True,
                'user': {
                    'email': user['email'],
                    'name': user.get('name', ''),
                    'created_at': user['created_at'].isoformat() if user.get('created_at') else None
                }
            }),
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Track login error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
