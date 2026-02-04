import { useEffect, useState } from 'react';

type Status = 'checking' | 'syncing' | 'success' | 'auth-required' | 'error';

interface SyncDebug {
  email?: string;
  stripe_customer_id?: string;
  stripe_customer_email?: string;
  stripe_subscription_id?: string;
  stripe_subscription_status?: string;
  all_subscription_statuses?: string[];
  error?: string;
}

export function PaymentSuccess() {
  const [status, setStatus] = useState<Status>('checking');
  const [retryCount, setRetryCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncDebug, setSyncDebug] = useState<SyncDebug | null>(null);
  const MAX_RETRIES = 10; // Try for up to 30 seconds (10 retries * 3 seconds)

  useEffect(() => {
    async function verifyAndRedirect() {
      try {
        // First check if authenticated
        const authRes = await fetch('/.auth/me');
        const authData = await authRes.json();

        if (!authData.clientPrincipal) {
          setStatus('auth-required');
          // Redirect to login, then back to dashboard
          setTimeout(() => {
            window.location.href = '/.auth/login/google?post_login_redirect_uri=/payment-success';
          }, 2000);
          return;
        }

        // User is authenticated, check subscription
        setStatus('syncing');
        const subRes = await fetch('/api/subscription-status');
        const contentType = subRes.headers.get('content-type') || '';

        if (!contentType.includes('application/json')) {
          // Got HTML instead of JSON - auth issue
          console.error('Got non-JSON response from subscription-status');
          setStatus('auth-required');
          setTimeout(() => {
            window.location.href = '/.auth/login/google?post_login_redirect_uri=/payment-success';
          }, 2000);
          return;
        }

        const subData = await subRes.json();

        if (subData.has_access) {
          // Success! Redirect to dashboard
          setStatus('success');
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 1500);
        } else if (retryCount < MAX_RETRIES) {
          // Subscription not synced yet, retry after delay
          console.log(`Subscription not found, retrying... (${retryCount + 1}/${MAX_RETRIES})`, subData.sync_debug);
          if (subData.sync_debug) {
            setSyncDebug(subData.sync_debug);
          }
          setRetryCount(prev => prev + 1);
          setTimeout(verifyAndRedirect, 3000);
        } else {
          // Max retries exceeded
          setStatus('error');
          if (subData.sync_debug) {
            setSyncDebug(subData.sync_debug);
          }
          setErrorMessage(subData.sync_debug?.error || 'Subscription sync is taking longer than expected. Please try refreshing or contact support.');
        }
      } catch (error) {
        console.error('Error verifying subscription:', error);
        if (retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
          setTimeout(verifyAndRedirect, 3000);
        } else {
          setStatus('error');
          setErrorMessage('Network error. Please check your connection and try again.');
        }
      }
    }

    verifyAndRedirect();
  }, [retryCount]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center border border-gray-700">
        {status === 'checking' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Received!</h1>
            <p className="text-gray-400">Verifying your account...</p>
          </>
        )}

        {status === 'syncing' && (
          <>
            <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h1 className="text-2xl font-bold text-white mb-2">Setting Up Your Subscription</h1>
            <p className="text-gray-400 mb-4">This may take a few moments...</p>
            {retryCount > 0 && (
              <div className="text-sm text-gray-500">
                Syncing with payment provider... ({retryCount}/{MAX_RETRIES})
              </div>
            )}
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">You're All Set!</h1>
            <p className="text-gray-400">Redirecting to your dashboard...</p>
          </>
        )}

        {status === 'auth-required' && (
          <>
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Almost Done!</h1>
            <p className="text-gray-400">Please sign in to access your subscription...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Taking Longer Than Expected</h1>
            <p className="text-gray-400 mb-4">{errorMessage}</p>

            {syncDebug && (
              <div className="bg-gray-900 rounded-lg p-4 mb-4 text-left text-xs font-mono overflow-x-auto">
                <div className="text-gray-500 mb-2">Debug Info:</div>
                {syncDebug.email && <div className="text-gray-400">Auth Email: {syncDebug.email}</div>}
                {syncDebug.stripe_customer_id && <div className="text-green-400">Stripe Customer: {syncDebug.stripe_customer_id}</div>}
                {syncDebug.stripe_customer_email && <div className="text-gray-400">Stripe Email: {syncDebug.stripe_customer_email}</div>}
                {syncDebug.stripe_subscription_id && <div className="text-green-400">Subscription: {syncDebug.stripe_subscription_id}</div>}
                {syncDebug.stripe_subscription_status && <div className="text-gray-400">Status: {syncDebug.stripe_subscription_status}</div>}
                {syncDebug.all_subscription_statuses && syncDebug.all_subscription_statuses.length > 0 && (
                  <div className="text-yellow-400">All Statuses: {syncDebug.all_subscription_statuses.join(', ')}</div>
                )}
                {syncDebug.error && <div className="text-red-400">Error: {syncDebug.error}</div>}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => {
                  setRetryCount(0);
                  setStatus('checking');
                  setErrorMessage(null);
                  setSyncDebug(null);
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
