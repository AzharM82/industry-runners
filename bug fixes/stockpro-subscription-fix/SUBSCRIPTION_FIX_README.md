# StockPro AI - Subscription Sync Fix

## Problem Summary

Users were unable to access the portal after completing Stripe payment. They would be asked to pay again, requiring manual intervention with the sync API.

## Root Causes

1. **Race Condition**: The Stripe webhook may not have processed by the time the user is redirected back to the dashboard
2. **Email Mismatch**: Stripe's `customer_email` might be empty or have different casing than the user's login email
3. **Missing Webhook Events**: Not all necessary Stripe events were configured
4. **No Auto-Recovery**: The system had no fallback to check Stripe directly when local subscription data was missing

## Solution Overview

The fix implements a **belt-and-suspenders approach**:

1. **Improved Webhook Handler** (`stripe-webhook/__init__.py`):
   - More robust email resolution (tries customer_email → metadata → Stripe customer lookup)
   - Centralized subscription sync function
   - Handles multiple webhook events (`checkout.session.completed`, `customer.subscription.created`, `invoice.paid`)
   - Deletes trial subscriptions when paid subscription is created
   - Extensive logging for debugging

2. **Auto-Sync in Status Check** (`subscription-status/__init__.py`):
   - When a user checks their subscription status and no local subscription is found
   - Automatically queries Stripe for active subscriptions
   - If found, syncs to local database immediately
   - User gets instant access without manual intervention

---

## Stripe Dashboard Configuration

### Required Webhook Events

Go to **Stripe Dashboard → Developers → Webhooks → [Your Endpoint]** and ensure these events are enabled:

**REQUIRED (Critical for subscription flow):**
- `checkout.session.completed` ✅ (Main event after payment)
- `customer.subscription.created` ✅ (Backup when subscription is created)
- `customer.subscription.updated` ✅ (Status changes)
- `customer.subscription.deleted` ✅ (Cancellations)
- `invoice.paid` ✅ (Backup - confirms payment successful)
- `invoice.payment_succeeded` ✅ (Another backup)
- `invoice.payment_failed` ✅ (Handle failed payments)

**Optional but Recommended:**
- `customer.created`
- `customer.updated`

### Webhook Endpoint URL

Your webhook endpoint should be:
```
https://www.stockproai.net/api/stripe-webhook
```

### Verify Webhook Secret

Ensure `STRIPE_WEBHOOK_SECRET` in your Azure Function App settings matches the webhook signing secret from Stripe Dashboard.

---

## File Changes Summary

### 1. `api/stripe-webhook/__init__.py`
**Changes:**
- Added `get_or_create_user_for_stripe()` - robust user lookup/creation
- Added `sync_subscription_from_stripe()` - centralized sync function
- Improved `handle_checkout_completed()`:
  - Better email resolution (tries 3 sources)
  - Deletes trial subscriptions when paid subscription is created
  - More logging
- Added `handle_invoice_paid()` as backup event handler
- All handlers now use the centralized sync function

### 2. `api/subscription-status/__init__.py`
**Changes:**
- Added `auto_sync_stripe_subscription()` function
- In `main()`, when no local subscription is found:
  - Calls `auto_sync_stripe_subscription()` before giving up
  - If Stripe has an active subscription, syncs it immediately
  - User gets access without manual intervention

---

## Deployment Steps

1. **Copy the fixed files to your repository:**
   ```bash
   # Replace the files in your repo
   cp fixes/api/stripe-webhook/__init__.py api/stripe-webhook/__init__.py
   cp fixes/api/subscription-status/__init__.py api/subscription-status/__init__.py
   ```

2. **Deploy to Azure:**
   ```bash
   # If using SWA CLI
   swa deploy
   
   # Or push to your deployment branch
   git add -A
   git commit -m "Fix subscription sync race condition"
   git push
   ```

3. **Verify Stripe Webhook Configuration:**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Ensure all required events are enabled
   - Verify the webhook URL is correct
   - Test with a new subscription

4. **Test the Fix:**
   - Create a new test user
   - Complete a Stripe payment
   - User should automatically have access without manual sync

---

## How the Auto-Sync Works

```
User completes payment on Stripe
         ↓
User redirected to /dashboard?success=true
         ↓
Frontend calls /api/subscription-status
         ↓
Backend checks local database for subscription
         ↓
    ┌─── Found? ─────────────────────┐
    │                                │
   YES                              NO
    │                                │
    ↓                                ↓
Return subscription           auto_sync_stripe_subscription()
                                     │
                              Query Stripe API
                                     │
                              ┌─── Found? ───┐
                              │              │
                             YES            NO
                              │              │
                              ↓              ↓
                    Create local sub    Create trial
                    Return with access  (if eligible)
```

---

## Debugging Tips

1. **Check Azure Function Logs:**
   - Look for lines starting with `===` for key events
   - Example: `=== CHECKOUT COMPLETED for user@email.com ===`

2. **Verify in Stripe Dashboard:**
   - Go to Customers → Find user's email
   - Check Subscriptions tab for status
   - Check Events tab to see if webhooks were sent

3. **Check Database:**
   ```sql
   -- Find user
   SELECT * FROM users WHERE email = 'user@email.com';
   
   -- Check their subscriptions
   SELECT * FROM subscriptions WHERE user_id = '<user-id>';
   ```

4. **Manual Sync (Admin):**
   If auto-sync fails, admins can still manually sync:
   ```javascript
   fetch('/api/subscription-status?sync=user@email.com')
     .then(r => r.json())
     .then(console.log)
   ```

---

## Environment Variables Required

Ensure these are set in Azure Function App settings:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Your Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard |
| `DATABASE_URL` | PostgreSQL connection string |
| `STRIPE_PRICE_ID` | Price ID for your subscription product |

---

## Testing Checklist

- [ ] New user can sign up and complete payment
- [ ] User is redirected to dashboard with access
- [ ] User's subscription shows as "active" in admin panel
- [ ] Webhook events are being received (check Stripe Dashboard → Webhooks → Events)
- [ ] Auto-sync works if webhook is delayed (test by temporarily disabling webhook)
- [ ] Trial subscriptions are deleted when paid subscription is created
