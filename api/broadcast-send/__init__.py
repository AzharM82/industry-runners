"""
Admin Broadcast — enqueue an email to all paid subscribers (or test-to-self).

POST /api/broadcast-send
Body: {
  "subject": "Update: ...",
  "body_md": "Hello **everyone** ...",
  "test": true|false   (true → only sends to ADMIN_TEST_EMAIL)
}

Renders the markdown to HTML, looks up paying recipients, enqueues one
broadcast_queue row per recipient. Returns immediately. The drain
function (api/broadcast-drain) handles the actual SMTP sends.
"""

import base64
import json
import logging
import os
import sys
import traceback
import uuid

import azure.functions as func

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.admin import is_admin
from shared.database import (
    enqueue_broadcast,
    get_broadcast_recipient_emails,
    init_schema,
)

# Test-mode broadcasts always go here regardless of who clicked the button.
ADMIN_TEST_EMAIL = "reachazhar@hotmail.com"


def _get_user_from_auth(req):
    principal = req.headers.get('X-MS-CLIENT-PRINCIPAL')
    if not principal:
        return None
    try:
        return json.loads(base64.b64decode(principal))
    except Exception:
        return None


def _json(payload, status=200):
    return func.HttpResponse(
        json.dumps(payload, default=str),
        status_code=status,
        mimetype='application/json',
    )


def _render_markdown(md: str) -> tuple[str, str]:
    """Return (html, plain_text). Wraps the rendered HTML in a minimal
    email-safe template (white card, dark text, system font)."""
    try:
        import markdown as md_lib
        body_html = md_lib.markdown(md, extensions=['fenced_code', 'tables', 'nl2br'])
    except Exception as e:
        logging.warning(f"Markdown render failed, falling back to <pre>: {e}")
        # Fall back to pre-formatted text so the message still arrives.
        from html import escape
        body_html = f"<pre>{escape(md)}</pre>"

    template = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">StockPro AI</div>
    <div style="font-size:15px;line-height:1.6;">{body_html}</div>
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
      This message is from your StockPro AI subscription.
      <a href="https://www.stockproai.net" style="color:#3b82f6;text-decoration:none;">stockproai.net</a>
    </div>
  </div>
</body></html>"""
    return template, md  # plain-text fallback = the original markdown source


def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        init_schema()

        auth = _get_user_from_auth(req)
        if not auth:
            return _json({'error': 'Unauthorized'}, 401)
        admin_email = (auth.get('userDetails') or '').lower()
        if not is_admin(admin_email):
            return _json({'error': 'Admin access required'}, 403)

        try:
            body = req.get_json() or {}
        except Exception:
            body = {}
        subject = (body.get('subject') or '').strip()
        body_md = (body.get('body_md') or '').strip()
        is_test = bool(body.get('test'))

        if not subject:
            return _json({'error': 'Subject is required'}, 400)
        if not body_md:
            return _json({'error': 'Message body is required'}, 400)
        if len(subject) > 250:
            return _json({'error': 'Subject too long (max 250 chars)'}, 400)
        if len(body_md) > 50_000:
            return _json({'error': 'Body too long (max 50,000 chars)'}, 400)

        body_html, body_text = _render_markdown(body_md)

        if is_test:
            recipients = [ADMIN_TEST_EMAIL]
        else:
            recipients = get_broadcast_recipient_emails()

        if not recipients:
            return _json({'error': 'No recipients found'}, 400)

        broadcast_id = str(uuid.uuid4())
        count = enqueue_broadcast(
            broadcast_id=broadcast_id,
            recipients=recipients,
            subject=subject if not is_test else f"[TEST] {subject}",
            body_html=body_html,
            body_text=body_text,
            triggered_by=admin_email,
            is_test=is_test,
        )

        return _json({
            'status': 'ok',
            'broadcast_id': broadcast_id,
            'enqueued': count,
            'is_test': is_test,
            'sample_recipients': recipients[:5],
        })
    except Exception as exc:
        logging.error(f"broadcast-send failed: {exc}\n{traceback.format_exc()}")
        return _json({'error': str(exc), 'trace': traceback.format_exc()}, 500)
