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
import { PromptRunner } from '../components/PromptRunner';
import { UsageGuide } from '../components/UsageGuide';
import { useAuth, logout } from '../hooks';

interface SubscriptionStatus {
  has_access: boolean;
  is_admin: boolean;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  reason?: string;
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

type DashboardType = 'ai-analysis' | 'analysis' | 'focus' | 'breadth' | 'swing' | 'daytrade' | 'trade-management' | 'investments';

export function Dashboard() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardType>('ai-analysis');
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [indices, setIndices] = useState<MarketIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [showUsageGuide, setShowUsageGuide] = useState(false);
  const [selectedStockDetails, setSelectedStockDetails] = useState<StockQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(isMarketOpen());
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const response = await fetch('/api/subscription-status');
        if (response.ok) {
          const data = await response.json();
          setSubscriptionStatus(data);
        } else {
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

    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center border border-gray-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">S</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Subscription Required</h1>
          <p className="text-gray-400 mb-6">
            Get access to AI-powered stock analysis, market insights, and more for just $6.99/month.
          </p>

          {checkoutError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              Checkout error: {decodeURIComponent(checkoutError)}
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
                onClick={() => setShowUsageGuide(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                Usage Guide
              </button>
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

        {activeTab === 'ai-analysis' ? (
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

      {/* Usage Guide Modal */}
      <UsageGuide isOpen={showUsageGuide} onClose={() => setShowUsageGuide(false)} />

      {/* Footer */}
      <footer className="border-t border-gray-800 py-4 mt-8">
        <div className="max-w-[2400px] mx-auto px-4 text-center text-xs text-gray-600">
          Data provided by Polygon.io. Auto-refreshes every 5 minutes during market hours.
        </div>
      </footer>
    </div>
  );
}
