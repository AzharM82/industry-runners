"""
Update Profile API - Allows users to update their phone number.
Phone number is required for notifications about investments.
"""

import json
import os
import base64
import logging
import re
import azure.functions as func

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from shared.database import get_user_by_email, update_user_phone, init_schema


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


def validate_phone_number(phone: str) -> bool:
    """Validate phone number format (allows various formats)."""
    if not phone:
        return False
    # Remove common separators and check if remaining chars are digits
    cleaned = re.sub(r'[\s\-\(\)\+]', '', phone)
    # Should be 10-15 digits
    return cleaned.isdigit() and 10 <= len(cleaned) <= 15


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

        # GET request - return current profile
        if req.method == 'GET':
            user = get_user_by_email(user_email)
            if not user:
                return func.HttpResponse(
                    json.dumps({'error': 'User not found'}),
                    status_code=404,
                    mimetype='application/json'
                )

            return func.HttpResponse(
                json.dumps({
                    'email': user['email'],
                    'name': user.get('name', ''),
                    'phone_number': user.get('phone_number'),
                    'has_phone': bool(user.get('phone_number')),
                    'is_new_user': user.get('is_new_user', False)
                }),
                mimetype='application/json'
            )

        # POST request - update phone number
        if req.method == 'POST':
            try:
                body = req.get_json()
            except:
                return func.HttpResponse(
                    json.dumps({'error': 'Invalid JSON body'}),
                    status_code=400,
                    mimetype='application/json'
                )

            phone_number = body.get('phone_number', '').strip()

            if not phone_number:
                return func.HttpResponse(
                    json.dumps({'error': 'Phone number is required'}),
                    status_code=400,
                    mimetype='application/json'
                )

            if not validate_phone_number(phone_number):
                return func.HttpResponse(
                    json.dumps({'error': 'Invalid phone number format. Please enter 10-15 digits.'}),
                    status_code=400,
                    mimetype='application/json'
                )

            # Update phone number
            update_user_phone(user_email, phone_number)

            # Get updated user
            user = get_user_by_email(user_email)

            return func.HttpResponse(
                json.dumps({
                    'success': True,
                    'message': 'Phone number updated successfully',
                    'phone_number': user.get('phone_number')
                }),
                mimetype='application/json'
            )

        return func.HttpResponse(
            json.dumps({'error': 'Method not allowed'}),
            status_code=405,
            mimetype='application/json'
        )

    except Exception as e:
        logging.error(f"Update profile error: {e}")
        return func.HttpResponse(
            json.dumps({'error': str(e)}),
            status_code=500,
            mimetype='application/json'
        )
