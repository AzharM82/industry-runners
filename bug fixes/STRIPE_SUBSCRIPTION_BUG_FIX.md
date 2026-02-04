# StockPro AI - Stripe Subscription Bug Fix

## Bug Report

**Issue:** Users complete payment on Stripe successfully, but cannot access the application. They are repeatedly asked to pay again.

**Affected Users:** All new subscribers after payment completion

**Severity:** Critical - Users paying but not receiving access

---

## Root Cause Analysis

### The Problem Flow

```
User completes Stripe payment
         ↓
Stripe sends webhook (checkout.session.completed) ✅
         ↓
Webhook returns 200 OK ✅
         ↓
BUT subscription NOT saved to database ❌
         ↓
User redirected to dashboard
         ↓
Dashboard checks /api/subscription-status
         ↓
No subscription found → "Please subscribe"
         ↓
User sees payment screen again 😞
```

### Why Webhooks Return 200 OK But Don't Save Data

The original webhook code had **silent failures** - errors were caught but not properly logged, and the function still returned `200 OK` to Stripe.

```python
# ORIGINAL PROBLEMATIC CODE
try:
    stripe_sub = stripe.Subscription.retrieve(subscription_id)
    create_subscription(...)
except Exception as e:
    logging.error(f"Error creating subscription from checkout: {e}")
    # Returns 200 anyway - Stripe thinks everything is fine!
```

### Identified Issues

#### Issue 1: Silent Exception Handling

The webhook catches exceptions but:
- Doesn't log the full stack trace
- Still returns 200 OK to Stripe
- Stripe doesn't retry because it thinks the webhook succeeded

#### Issue 2: Insufficient Logging

The original code only logged:
```
Error creating subscription from checkout: [brief error message]
```

Without the stack trace, it's impossible to know:
- Which line failed
- What the actual error was
- What data was being processed

#### Issue 3: No Fallback Mechanisms

If `checkout.session.completed` fails:
- `customer.subscription.created` might also fail for same reason
- `invoice.paid` wasn't being handled
- No auto-sync mechanism existed

#### Issue 4: Auth Cookie Issue After Stripe Redirect

Separately, after Stripe redirects back to the dashboard:
- Azure Static Web Apps auth cookie may not be sent
- API returns 401 or HTML redirect
- Frontend can't parse the response
- User appears "not logged in"

---

## The Fix

### Part 1: Fixed Webhook Handler (`api/stripe-webhook/__init__.py`)

**Key Changes:**

1. **Full Stack Trace Logging**
```python
import traceback

except Exception as e:
    logging.error(f"Error: {e}")
    logging.error(traceback.format_exc())  # Full stack trace
```

2. **Detailed Step-by-Step Logging**
```python
logging.info(f"checkout.session.completed:")
logging.info(f"  customer_email: {customer_email}")
logging.info(f"  customer_id: {customer_id}")
logging.info(f"  subscription_id: {subscription_id}")
logging.info(f"  metadata_user_id: {metadata_user_id}")
```

3. **Success/Failure Confirmation**
```python
if result:
    logging.info(f"SUCCESS: Created subscription {subscription_id} for {email}")
else:
    logging.error(f"FAILED: create_subscription returned None")
```

4. **Multiple Event Handlers as Backup**
```python
elif event_type == 'invoice.paid':
    handle_payment_succeeded(data)  # Backup handler
```

5. **Better Email Extraction**
```python
# Try multiple sources for email
customer_email = session.get('customer_email', '').lower().strip()
if not customer_email:
    customer_details = session.get('customer_details', {})
    customer_email = customer_details.get('email', '').lower().strip()
if not customer_email:
    customer_email = metadata.get('user_email', '').lower().strip()
```

### Part 2: Auto-Sync in Subscription Status (`api/subscription-status/__init__.py`)

Added automatic Stripe sync when subscription not found locally:

```python
def auto_sync_stripe_subscription(email: str, user_id: str):
    """
    If no local subscription, check Stripe directly and sync.
    This catches cases where webhook failed.
    """
    # Find customer in Stripe by email
    customers = stripe.Customer.list(email=email, limit=1)
    if not customers.data:
        return None
    
    # Find active subscription
    subscriptions = stripe.Subscription.list(
        customer=customers.data[0].id, 
        status='active', 
        limit=1
    )
    
    if subscriptions.data:
        # Create in local database
        create_subscription(...)
        return subscription
```

### Part 3: Payment Success Page (`pages/payment-success.tsx`)

Handles the auth cookie issue after Stripe redirect:

```typescript
// Check if authenticated
const authRes = await fetch('/.auth/me');
const authData = await authRes.json();

if (!authData.clientPrincipal) {
    // Redirect to login, then back to dashboard
    window.location.href = '/.auth/login/google?post_login_redirect_uri=/dashboard';
    return;
}

// Check subscription with retry logic
const subRes = await fetch('/api/subscription-status');
// ... retry up to 5 times if not synced yet
```

---

## Files Changed

| File | Change |
|------|--------|
| `api/stripe-webhook/__init__.py` | Complete rewrite with better error handling |
| `api/subscription-status/__init__.py` | Added `auto_sync_stripe_subscription()` function |
| `api/create-checkout-session/__init__.py` | Changed `success_url` to `/payment-success` |
| `pages/payment-success.tsx` | New page to handle post-payment flow |

---

## Stripe Dashboard Configuration

Ensure these webhook events are enabled:

| Event | Purpose | Required |
|-------|---------|----------|
| `checkout.session.completed` | Primary - after payment | ✅ Yes |
| `customer.subscription.created` | Backup - subscription created | ✅ Yes |
| `customer.subscription.updated` | Status changes, renewals | ✅ Yes |
| `customer.subscription.deleted` | Cancellations | ✅ Yes |
| `invoice.paid` | Backup - payment confirmed | ✅ Yes |
| `invoice.payment_succeeded` | Backup - payment success | ✅ Yes |
| `invoice.payment_failed` | Handle failed payments | ✅ Yes |

---

## Deployment Steps

### Step 1: Deploy Backend Fixes

```bash
# Replace webhook handler
cp stripe-webhook-fixed.py api/stripe-webhook/__init__.py

# Replace subscription status (if using auto-sync)
cp subscription-status-fixed.py api/subscription-status/__init__.py

# Deploy
git add -A
git commit -m "Fix Stripe subscription sync bug"
git push
```

### Step 2: Deploy Frontend Fix

```bash
# Add payment success page
cp payment-success.tsx src/pages/payment-success.tsx

# Deploy
git add -A
git commit -m "Add payment success page for auth handling"
git push
```

### Step 3: Fix Existing Affected Users

For users who already paid but don't have access:

```javascript
// Run in browser console as admin
fetch('/api/subscription-status?sync=user@email.com')
  .then(r => r.json())
  .then(console.log)
```

Or via SQL:

```sql
-- Find user
SELECT id FROM users WHERE email = 'user@email.com';

-- Manually create subscription (get details from Stripe dashboard)
INSERT INTO subscriptions (
    user_id, 
    stripe_subscription_id, 
    status, 
    current_period_start, 
    current_period_end
) VALUES (
    'user-uuid-here',
    'sub_xxxxx',
    'active',
    to_timestamp(1234567890),
    to_timestamp(1234567890)
);
```

---

## Verification

### Check Webhook Logs

After deploying, monitor Azure Function logs for:

```
=== STRIPE WEBHOOK RECEIVED ===
=== PROCESSING: checkout.session.completed ===
checkout.session.completed:
  customer_email: user@email.com
  customer_id: cus_xxxxx
  subscription_id: sub_xxxxx
  metadata_user_id: uuid-here
Found user by email: user@email.com
Updated stripe_customer_id to cus_xxxxx
Retrieved Stripe subscription: status=active
SUCCESS: Created subscription sub_xxxxx for user@email.com
=== COMPLETED: checkout.session.completed ===
```

### Test New Payment

1. Use Stripe test mode with card `4242 4242 4242 4242`
2. Complete payment
3. Should see "Payment Successful" page
4. Auto-redirect to dashboard with access

### Verify in Database

```sql
-- Check subscription was created
SELECT u.email, s.stripe_subscription_id, s.status, s.created_at
FROM subscriptions s
JOIN users u ON s.user_id = u.id
ORDER BY s.created_at DESC
LIMIT 5;
```

---

## Prevention

To prevent this issue in the future:

1. **Always log full stack traces** in webhook handlers
2. **Monitor webhook success rate** in Stripe dashboard
3. **Set up alerts** for webhook failures
4. **Have fallback mechanisms** (auto-sync) for critical flows
5. **Test payment flow** after every deployment

---

## Summary

| Problem | Solution |
|---------|----------|
| Silent webhook failures | Added detailed logging + stack traces |
| No fallback when webhook fails | Added auto-sync in subscription-status |
| Auth cookie lost after Stripe redirect | Added payment-success page with re-auth |
| Missing webhook events | Enabled `invoice.paid`, `subscription.updated` |

**Result:** Users now get immediate access after payment, with multiple fallback mechanisms if any single component fails.
