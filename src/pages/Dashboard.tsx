import { useState, useEffect, useCallback, useMemo } from 'react';
import type { StockQuote, ETFWithData, MarketIndex, DayTradeGroup } from '../types';
import { ETF_DATA, getAllStockSymbols } from '../data/etfs';
import { DAYTRADE_INDUSTRIES, getAllDayTradeSymbols } from '../data/daytrade';
import { ETFCard } from '../components/ETFCard';
import { DayTradeCard } from '../components/DayTradeCard';
import { StockModal } from '../components/StockModal';
import { MarketIndices } from '../components/MarketIndices';
import { StockAnalysisView } from '../components/StockAnalysisView';
import { FocusStocksView } from '../components/FocusStocksView';
import { BreadthIndicatorsView } from '../components/BreadthIndicatorsView';
import { TradeManagementView } from '../components/TradeManagementView';
import { InvestmentTrackerView } from '../components/InvestmentTrackerView';
import { SectorRotationView } from '../components/SectorRotationView';
import { PromptRunner } from '../components/PromptRunner';
import { StartHereView } from '../components/StartHereView';
import { useAuth, logout } from '../hooks';

interface SubscriptionStatus {
  has_access: boolean;
  is_admin: boolean;
  is_new_user?: boolean;
  has_phone?: boolean;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    is_trial?: boolean;
  } | null;
  reason?: string;
  trial_message?: string;
}

const API_BASE = '/api';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

// Fetch with retry logic for cold start handling
async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      const text = await response.text();
      if (text.includes('Backend call failure') || response.status >= 500) {
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
      }
      throw new Error(`HTTP ${response.status}: ${text}`);
    } catch (err) {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// Market indices to display at the top
const MARKET_INDICES = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'NASDAQ' },
  { symbol: 'DIA', name: 'DOW' },
  { symbol: 'IWM', name: 'Russell 2000' },
  { symbol: 'IJR', name: 'S&P 600' },
];

// Check if market is open (9:30 AM - 4:00 PM ET, Mon-Fri)
function isMarketOpen(): boolean {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (day === 0 || day === 6) return false;
  const marketOpen = 9 * 60 + 30;
  const marketClose = 16 * 60;
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

// Get all unique symbols (swing + day trade + indices)
function getAllSymbols(): string[] {
  const symbols = new Set<string>();

  // Add market indices
  MARKET_INDICES.forEach(idx => symbols.add(idx.symbol));

  // Add swing trading symbols
  getAllStockSymbols().forEach(s => symbols.add(s));

  // Add day trading symbols
  getAllDayTradeSymbols().forEach(s => symbols.add(s));

  return Array.from(symbols);
}

type DashboardType = 'start-here' | 'ai-analysis' | 'analysis' | 'focus' | 'breadth' | 'sector-rotation' | 'swing' | 'daytrade' | 'trade-management' | 'investments';

export function Dashboard() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardType>('start-here');
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedStockDetails, setSelectedStockDetails] = useState<StockQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async (retryCount = 0) => {
      try {
        const response = await fetch('/api/subscription-status');

        // Check if we got HTML instead of JSON (indicates auth redirect issue)
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.error('API returned non-JSON response. Content-Type:', contentType);

          // Check for ?success=true in URL - means just returned from Stripe
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('success') === 'true' && retryCount < 3) {
            // Wait a moment for auth to settle, then retry
            console.log(`Retrying subscription check (attempt ${retryCount + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return checkSubscription(retryCount + 1);
          }

          // Force refresh auth by calling /.auth/me
          const authResponse = await fetch('/.auth/me');
          const authData = await authResponse.json();
          console.log('Auth check:', authData);

          if (!authData.clientPrincipal) {
            // Auth lost - redirect to login
            console.error('Authentication lost, redirecting to login');
            window.location.href = '/login/google';
            return;
          }

          // Auth is valid but API still returning HTML - likely deployment issue
          setSubscriptionStatus({
            has_access: false,
            is_admin: false,
            subscription: null,
            reason: 'API error - please try refreshing the page'
          });
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setSubscriptionStatus(data);
          // Show phone modal if user doesn't have phone number
          if (data.has_access && !data.has_phone && !data.is_admin) {
            setShowPhoneModal(true);
          }

          // Clear success param from URL to prevent confusion on refresh
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('success') === 'true') {
            window.history.replaceState({}, '', '/dashboard');
          }
        } else {
          const text = await response.text();
          console.error('Subscription check failed:', response.status, text);
          setSubscriptionStatus({ has_access: false, is_admin: false, subscription: null, reason: 'Failed to check subscription' });
        }
      } catch (err) {
        console.error('Error checking subscription:', err);
        setSubscriptionStatus({ has_access: false, is_admin: false, subscription: null, reason: 'Network error' });
      } finally {
        setSubscriptionLoading(false);
      }
    };
    checkSubscription();
  }, []);

  // Track user login for analytics
  useEffect(() => {
    const trackLogin = async () => {
      try {
        await fetch('/api/track-login', { method: 'POST' });
      } catch (err) {
        // Silently fail - analytics shouldn't break the app
        console.error('Failed to track login:', err);
      }
    };
    trackLogin();
  }, []);

  // Fetch ALL quotes (swing + day trade) in one request
  const fetchAllQuotes = useCallback(async () => {
    try {
      setError(null);
      const allSymbols = getAllSymbols();

      const response = await fetchWithRetry(`${API_BASE}/quotes?symbols=${allSymbols.join(',')}`);
      const data = await response.json();
      const allQuotes: Record<string, StockQuote> = data.quotes || {};

      setQuotes(allQuotes);
      setLastUpdate(new Date());

      // Build market indices data
      const indicesData: MarketIndex[] = MARKET_INDICES.map(idx => {
        const quote = allQuotes[idx.symbol];
        return {
          symbol: idx.symbol,
          name: idx.name,
          last: quote?.last || 0,
          change: quote?.change || 0,
          changePercent: quote?.changePercent || 0,
          change5Day: quote?.change5Day,
        };
      });
      setIndices(indicesData);
    } catch (err) {
      setError('Failed to fetch stock data. Please check your connection.');
      console.error('Error fetching quotes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper function to calculate median
  const calculateMedian = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  };

  // Build swing trading ETF data from quotes
  const etfData = useMemo((): ETFWithData[] => {
    if (Object.keys(quotes).length === 0) return [];

    // Track used stocks globally to prevent duplicates across ETFs
    const usedStocks = new Set<string>();

    // First pass: build ETF data with stocks
    const etfDataWithMedian = ETF_DATA.map(etf => {
      const etfChange = quotes[etf.symbol]?.changeFromOpenPercent ?? 0;

      // Get up to 10 unique stocks for this ETF (not used in previous ETFs)
      const uniqueStocks: StockQuote[] = [];
      for (const symbol of etf.holdings) {
        if (uniqueStocks.length >= 10) break;
        if (usedStocks.has(symbol)) continue;

        const stock = quotes[symbol];
        if (!stock) continue;

        const relativeStrength = stock.changeFromOpenPercent - etfChange;

        uniqueStocks.push({
          ...stock,
          relativeStrength: Math.round(relativeStrength * 100) / 100
        });

        usedStocks.add(symbol);
      }

      uniqueStocks.sort((a, b) => b.changeFromOpenPercent - a.changeFromOpenPercent);

      // Calculate median of stocks' changeFromOpenPercent
      const stockChanges = uniqueStocks.map(s => s.changeFromOpenPercent);
      const medianChangeFromOpen = Math.round(calculateMedian(stockChanges) * 100) / 100;

      return {
        ...etf,
        etfQuote: quotes[etf.symbol],
        stocks: uniqueStocks,
        medianChangeFromOpen
      };
    });

    // Sort ETFs by median changeFromOpen (highest first)
    etfDataWithMedian.sort((a, b) => b.medianChangeFromOpen - a.medianChangeFromOpen);

    return etfDataWithMedian;
  }, [quotes]);

  // Build day trading data from quotes + static ATR from Excel
  const dayTradeData = useMemo((): DayTradeGroup[] => {
    if (Object.keys(quotes).length === 0) return [];

    const dayTradeGroups: DayTradeGroup[] = [];

    for (const industry of DAYTRADE_INDUSTRIES) {
      const stocks: DayTradeGroup['stocks'] = [];

      for (const stockData of industry.stocks) {
        const quote = quotes[stockData.symbol];
        if (!quote) continue;

        stocks.push({
          symbol: stockData.symbol,
          name: stockData.name,
          last: quote.last,
          atr: stockData.atr,
          atrPercent: stockData.atrPercent,
          avgVolume: stockData.avgVolume,
          volume: quote.volume,
          changePercent: quote.changePercent,
          changeFromOpenPercent: quote.changeFromOpenPercent,
          high: quote.high,
          low: quote.low,
          open: quote.open,
        });
      }

      // Sort stocks by % change from open (highest first)
      stocks.sort((a, b) => b.changeFromOpenPercent - a.changeFromOpenPercent);

      if (stocks.length > 0) {
        // Calculate average % change for the group
        const avgChangePercent = stocks.reduce((sum, s) => sum + s.changePercent, 0) / stocks.length;

        dayTradeGroups.push({
          name: industry.name,
          stocks: stocks,
          avgChangePercent: Math.round(avgChangePercent * 100) / 100
        });
      }
    }

    // Sort groups by average % change (highest first)
    dayTradeGroups.sort((a, b) => b.avgChangePercent - a.avgChangePercent);

    return dayTradeGroups;
  }, [quotes]);

  // Initial fetch
  useEffect(() => {
    fetchAllQuotes();
  }, [fetchAllQuotes]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      const isOpen = isMarketOpen();
      setMarketOpen(isOpen);

      if (isOpen) {
        fetchAllQuotes();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchAllQuotes]);

  // Check market status every minute
  useEffect(() => {
    const statusInterval = setInterval(() => {
      setMarketOpen(isMarketOpen());
    }, 60000);
    return () => clearInterval(statusInterval);
  }, []);

  const fetchStockDetails = async (symbol: string) => {
    try {
      const response = await fetch(`${API_BASE}/details?symbol=${symbol}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedStockDetails(data);
      }
    } catch (err) {
      console.error('Error fetching stock details:', err);
    }
  };

  const handleStockClick = (symbol: string) => {
    setSelectedStock(symbol);
    setSelectedStockDetails(quotes[symbol] || null);
    fetchStockDetails(symbol);
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchAllQuotes();
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    setPhoneSubmitting(true);

    // Basic validation
    const cleaned = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
    if (!cleaned || cleaned.length < 10 || cleaned.length > 15) {
      setPhoneError('Please enter a valid phone number (10-15 digits)');
      setPhoneSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });

      const data = await response.json();
      if (response.ok) {
        setShowPhoneModal(false);
        // Update subscription status to reflect phone is now set
        setSubscriptionStatus(prev => prev ? { ...prev, has_phone: true } : prev);
      } else {
        setPhoneError(data.error || 'Failed to save phone number');
      }
    } catch (err) {
      setPhoneError('Network error. Please try again.');
    } finally {
      setPhoneSubmitting(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    // Redirect to login
    window.location.href = '/login';
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-400">Redirecting to login...</div>
        </div>
      </div>
    );
  }

  // Show loading while checking subscription
  if (subscriptionLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-400">Checking subscription...</div>
        </div>
      </div>
    );
  }

  // Show subscription required page if user doesn't have access
  // Default to blocking if subscription status is missing or has_access is not explicitly true
  if (!subscriptionStatus || !subscriptionStatus.has_access) {
    // Check for checkout errors in URL
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutError = urlParams.get('checkout_error');
    const justPaid = urlParams.get('success') === 'true';

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center border border-gray-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">S</span>
          </div>

          {justPaid ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Payment Processing...</h1>
              <p className="text-gray-400 mb-6">
                Your payment was received. Please wait a moment while we activate your subscription.
              </p>
              <div className="mb-4 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-300 text-sm">
                If this page doesn't update automatically, please click the refresh button below.
              </div>
              <button
                onClick={() => window.location.reload()}
                className="block w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors mb-4"
              >
                Refresh Page
              </button>
              <p className="text-gray-500 text-sm">
                Still having issues? Contact support with your email: {user?.userDetails}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Subscription Required</h1>
              <p className="text-gray-400 mb-6">
                Get access to AI-powered stock analysis, market insights, and more for just $6.99/month.
              </p>

              {checkoutError && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                  Checkout error: {decodeURIComponent(checkoutError)}
                </div>
              )}

              {subscriptionStatus?.reason && subscriptionStatus.reason !== 'Failed to check subscription' && (
                <div className="mb-4 p-3 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-300 text-sm">
                  {subscriptionStatus.reason}
                </div>
              )}

              <div className="bg-gray-700/50 rounded-xl p-4 mb-6 text-left">
                <h3 className="text-white font-semibold mb-3">What you get:</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">+</span>
                    30 ChartGPT AI analyses/month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">+</span>
                    30 Deep Research reports/month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">+</span>
                    30 Halal Compliance checks/month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-400">+</span>
                    Real-time market data & analysis tools
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  // Direct navigation to checkout API which will redirect to Stripe
                  window.location.href = '/api/create-checkout-session';
                }}
                className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors mb-4"
              >
                Subscribe Now - $6.99/month
              </button>
            </>
          )}

          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Phone number collection modal - blocks access until phone is provided
  if (showPhoneModal) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center border border-gray-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Complete Your Profile</h1>
          <p className="text-gray-400 mb-6">
            Please provide your phone number to receive important investment notifications and alerts.
          </p>

          {subscriptionStatus?.trial_message && (
            <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-lg text-blue-300 text-sm">
              {subscriptionStatus.trial_message}
            </div>
          )}

          <form onSubmit={handlePhoneSubmit} className="space-y-4">
            <div className="text-left">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              {phoneError && (
                <p className="mt-2 text-sm text-red-400">{phoneError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={phoneSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors"
            >
              {phoneSubmitting ? 'Saving...' : 'Continue to Dashboard'}
            </button>
          </form>

          <p className="mt-4 text-xs text-gray-500">
            Your phone number will only be used to send you investment notifications. We will never share it with third parties.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Market Indices Bar */}
      <MarketIndices indices={indices} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-[2400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <h1 className="text-xl font-bold text-white">StockPro AI</h1>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${marketOpen ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                {marketOpen ? 'Market Open' : 'Market Closed'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-sm text-gray-400">
                  {user.userDetails}
                </span>
              )}
              {lastUpdate && (
                <span className="text-xs text-gray-500">
                  Last update: {formatTime(lastUpdate)}
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <a
                href="mailto:reachazure37@gmail.com?subject=StockPro%20AI%20Feedback&body=Hi%2C%0A%0AI%20wanted%20to%20share%20my%20feedback%20about%20StockPro%20AI%3A%0A%0A"
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
                title="Send us your feedback"
              >
                Feedback
              </a>
              <button
                onClick={logout}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Dashboard Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto">
            <button
              onClick={() => setActiveTab('start-here')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'start-here'
                  ? 'bg-emerald-600 text-white border-t border-l border-r border-emerald-500'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Start Here
            </button>
            <button
              onClick={() => setActiveTab('ai-analysis')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'ai-analysis'
                  ? 'bg-blue-600 text-white border-t border-l border-r border-blue-500'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              AI Analysis
            </button>
            <button
              onClick={() => setActiveTab('breadth')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'breadth'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Market Breadth
            </button>
            <button
              onClick={() => setActiveTab('sector-rotation')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'sector-rotation'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Sector Rotation
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'analysis'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Stock Analysis
            </button>
            <button
              onClick={() => setActiveTab('focus')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'focus'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Focus Stocks
            </button>
            <button
              onClick={() => setActiveTab('swing')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'swing'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Swing Trading
            </button>
            <button
              onClick={() => setActiveTab('daytrade')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'daytrade'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Day Trading
            </button>
            <button
              onClick={() => setActiveTab('trade-management')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'trade-management'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Trade Management
            </button>
            <button
              onClick={() => setActiveTab('investments')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === 'investments'
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700'
                  : 'bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              Long Term Investment
            </button>
          </div>
        </div>
      </header>

      {/* Trial Status Banner */}
      {subscriptionStatus?.subscription?.is_trial && subscriptionStatus?.trial_message && (
        <div className="bg-gradient-to-r from-blue-900/80 to-purple-900/80 border-b border-blue-700">
          <div className="max-w-[2400px] mx-auto px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-blue-200 text-sm">
                  {subscriptionStatus.trial_message}
                </span>
              </div>
              <button
                onClick={() => window.location.href = '/api/create-checkout-session'}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Subscribe Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Info Banner */}
      {activeTab === 'swing' && (
        <div className="max-w-[2400px] mx-auto px-4 py-2">
          <div className="text-xs text-gray-500 bg-gray-800/50 px-3 py-2 rounded-lg">
            <span className="text-gray-400 font-medium">Swing Trading:</span> ETF holdings sorted by % change from open. Top performers in each sector.
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[2400px] mx-auto px-4 py-4">
        {error && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {activeTab === 'start-here' ? (
          // Start Here - Welcome & Guide
          <StartHereView onNavigateToTab={(tab) => setActiveTab(tab as DashboardType)} />
        ) : activeTab === 'ai-analysis' ? (
          // AI Analysis Dashboard
          <PromptRunner />
        ) : activeTab === 'analysis' ? (
          // Stock Analysis Dashboard
          <StockAnalysisView />
        ) : activeTab === 'focus' ? (
          // Focus Stocks Dashboard
          <FocusStocksView />
        ) : activeTab === 'breadth' ? (
          // Breadth Indicators Dashboard
          <BreadthIndicatorsView />
        ) : activeTab === 'sector-rotation' ? (
          // Sector Rotation Dashboard
          <SectorRotationView />
        ) : activeTab === 'trade-management' ? (
          // Trade Management Dashboard
          <TradeManagementView />
        ) : activeTab === 'investments' ? (
          // Investment Tracker Dashboard
          <InvestmentTrackerView />
        ) : activeTab === 'swing' ? (
          // Swing Trading Dashboard
          loading && etfData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">Loading stock data...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {etfData.map(etf => (
                <ETFCard
                  key={etf.symbol}
                  etf={etf}
                  onStockClick={handleStockClick}
                />
              ))}
            </div>
          )
        ) : (
          // Day Trading Dashboard
          loading && dayTradeData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">Loading day trade stocks...</div>
            </div>
          ) : dayTradeData.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">No day trade stocks found</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {dayTradeData.map((group) => (
                <DayTradeCard
                  key={group.name}
                  group={group}
                  onStockClick={handleStockClick}
                />
              ))}
            </div>
          )
        )}
      </main>

      {/* Stock Detail Modal */}
      {selectedStock && (
        <StockModal
          stock={selectedStockDetails}
          symbol={selectedStock}
          onClose={() => {
            setSelectedStock(null);
            setSelectedStockDetails(null);
          }}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 mt-8">
        <div className="max-w-[2400px] mx-auto px-4 text-center space-y-2">
          <div className="text-xs text-gray-600">
            Data provided by Polygon.io. Auto-refreshes every 5 minutes during market hours.
          </div>
          <div className="text-xs text-gray-600 max-w-4xl mx-auto">
            <span className="text-gray-500">Disclaimer:</span> For educational and informational purposes only.
            Not financial advice. We are not registered investment advisors or CPAs.
            All investments involve risk. Consult a qualified professional before investing.
          </div>
        </div>
      </footer>
    </div>
  );
}
