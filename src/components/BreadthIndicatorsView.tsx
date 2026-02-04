import { useState, useEffect, useCallback, useMemo } from 'react';
import type { BreadthData, FinvizBreadthData, BreadthHistoryResponse } from '../types';

const API_BASE = '/api';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Market Condition Types
type MarketCondition = 'GET_OUT' | 'STAY_50' | 'ALL_IN';

interface MarketConditionResult {
  condition: MarketCondition;
  score: number;
  maxScore: number;
  signals: {
    bullish: string[];
    bearish: string[];
    neutral: string[];
  };
}

// Calculate market condition based on breadth data
function calculateMarketCondition(
  breadthData: BreadthData | null,
  finvizData: FinvizBreadthData | null
): MarketConditionResult {
  const signals = {
    bullish: [] as string[],
    bearish: [] as string[],
    neutral: [] as string[],
  };

  let score = 0;
  const maxScore = 14; // Maximum possible bullish score

  // === POLYGON DATA SIGNALS ===

  // T2108 (% above 40-day MA)
  if (breadthData?.t2108 != null) {
    const t2108 = breadthData.t2108;
    if (t2108 < 25) {
      // Extremely oversold - contrarian bullish
      score += 2;
      signals.bullish.push(`T2108 oversold at ${t2108}% (bounce likely)`);
    } else if (t2108 >= 25 && t2108 < 40) {
      score += 1;
      signals.bullish.push(`T2108 at ${t2108}% (recovering)`);
    } else if (t2108 >= 40 && t2108 <= 60) {
      score += 1;
      signals.neutral.push(`T2108 healthy at ${t2108}%`);
    } else if (t2108 > 60 && t2108 <= 70) {
      signals.neutral.push(`T2108 elevated at ${t2108}%`);
    } else if (t2108 > 70) {
      score -= 2;
      signals.bearish.push(`T2108 overbought at ${t2108}% (correction risk)`);
    }
  }

  // 5-Day Rolling Ratio
  if (breadthData?.primary.ratio5Day != null) {
    const ratio = breadthData.primary.ratio5Day;
    if (ratio >= 2) {
      score += 2;
      signals.bullish.push(`5-day ratio strong at ${ratio.toFixed(1)}`);
    } else if (ratio >= 1.2) {
      score += 1;
      signals.bullish.push(`5-day ratio positive at ${ratio.toFixed(1)}`);
    } else if (ratio >= 0.8) {
      signals.neutral.push(`5-day ratio neutral at ${ratio.toFixed(1)}`);
    } else if (ratio >= 0.5) {
      score -= 1;
      signals.bearish.push(`5-day ratio weak at ${ratio.toFixed(1)}`);
    } else {
      score -= 2;
      signals.bearish.push(`5-day ratio bearish at ${ratio.toFixed(1)}`);
    }
  }

  // 10-Day Rolling Ratio
  if (breadthData?.primary.ratio10Day != null) {
    const ratio = breadthData.primary.ratio10Day;
    if (ratio >= 1.5) {
      score += 2;
      signals.bullish.push(`10-day ratio strong at ${ratio.toFixed(1)}`);
    } else if (ratio >= 1) {
      score += 1;
      signals.bullish.push(`10-day ratio positive at ${ratio.toFixed(1)}`);
    } else if (ratio >= 0.7) {
      signals.neutral.push(`10-day ratio neutral at ${ratio.toFixed(1)}`);
    } else {
      score -= 2;
      signals.bearish.push(`10-day ratio bearish at ${ratio.toFixed(1)}`);
    }
  }

  // Quarter performance (momentum)
  if (breadthData?.primary.up25PlusQuarter != null && breadthData?.primary.down25PlusQuarter != null) {
    const upQ = breadthData.primary.up25PlusQuarter;
    const downQ = breadthData.primary.down25PlusQuarter;
    if (upQ > 0 && downQ > 0) {
      const qRatio = upQ / downQ;
      if (qRatio >= 2) {
        score += 1;
        signals.bullish.push(`Quarter momentum strong (${upQ} up vs ${downQ} down)`);
      } else if (qRatio < 0.5) {
        score -= 1;
        signals.bearish.push(`Quarter momentum weak (${upQ} up vs ${downQ} down)`);
      }
    }
  }

  // === FINVIZ DATA SIGNALS ===

  // High/Low Ratio
  if (finvizData?.highs.highLowRatio != null) {
    const hlRatio = finvizData.highs.highLowRatio;
    if (hlRatio >= 3) {
      score += 2;
      signals.bullish.push(`New Highs/Lows ratio excellent at ${hlRatio.toFixed(1)}`);
    } else if (hlRatio >= 1.5) {
      score += 1;
      signals.bullish.push(`More new highs than lows (${hlRatio.toFixed(1)})`);
    } else if (hlRatio >= 0.7) {
      signals.neutral.push(`Highs/Lows balanced at ${hlRatio.toFixed(1)}`);
    } else if (hlRatio >= 0.3) {
      score -= 1;
      signals.bearish.push(`More new lows than highs (${hlRatio.toFixed(1)})`);
    } else {
      score -= 2;
      signals.bearish.push(`New lows dominating (${hlRatio.toFixed(1)})`);
    }
  }

  // % Above SMA 200
  if (finvizData?.sma.aboveSMA200 != null && finvizData?.sma.belowSMA200 != null) {
    const above = finvizData.sma.aboveSMA200;
    const below = finvizData.sma.belowSMA200;
    const total = above + below;
    if (total > 0) {
      const pctAbove = (above / total) * 100;
      if (pctAbove >= 65) {
        score += 2;
        signals.bullish.push(`${pctAbove.toFixed(0)}% above SMA200 (strong trend)`);
      } else if (pctAbove >= 50) {
        score += 1;
        signals.bullish.push(`${pctAbove.toFixed(0)}% above SMA200 (healthy)`);
      } else if (pctAbove >= 35) {
        signals.neutral.push(`${pctAbove.toFixed(0)}% above SMA200 (weakening)`);
      } else if (pctAbove >= 20) {
        score -= 1;
        signals.bearish.push(`Only ${pctAbove.toFixed(0)}% above SMA200`);
      } else {
        score -= 2;
        signals.bearish.push(`Only ${pctAbove.toFixed(0)}% above SMA200 (bearish)`);
      }
    }
  }

  // % Above SMA 50 (shorter-term trend)
  if (finvizData?.sma.aboveSMA50 != null && finvizData?.sma.belowSMA50 != null) {
    const above = finvizData.sma.aboveSMA50;
    const below = finvizData.sma.belowSMA50;
    const total = above + below;
    if (total > 0) {
      const pctAbove = (above / total) * 100;
      if (pctAbove >= 60) {
        score += 1;
        signals.bullish.push(`${pctAbove.toFixed(0)}% above SMA50`);
      } else if (pctAbove < 40) {
        score -= 1;
        signals.bearish.push(`Only ${pctAbove.toFixed(0)}% above SMA50`);
      }
    }
  }

  // Golden Cross vs Death Cross
  if (finvizData?.trend.goldenCross != null && finvizData?.trend.deathCross != null) {
    const golden = finvizData.trend.goldenCross;
    const death = finvizData.trend.deathCross;
    if (golden > death * 1.5) {
      score += 1;
      signals.bullish.push(`More golden crosses (${golden}) than death crosses (${death})`);
    } else if (death > golden * 1.5) {
      score -= 1;
      signals.bearish.push(`More death crosses (${death}) than golden crosses (${golden})`);
    }
  }

  // Determine condition based on score
  // Score ranges: -14 to +14
  // All In: score >= 5 (strong bullish signals)
  // Stay 50%: score >= -2 and < 5 (mixed/neutral)
  // Get Out: score < -2 (bearish signals dominate)
  let condition: MarketCondition;
  if (score >= 5) {
    condition = 'ALL_IN';
  } else if (score >= -2) {
    condition = 'STAY_50';
  } else {
    condition = 'GET_OUT';
  }

  return { condition, score, maxScore, signals };
}

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

export function BreadthIndicatorsView() {
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [finvizData, setFinvizData] = useState<FinvizBreadthData | null>(null);
  const [historyData, setHistoryData] = useState<BreadthHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [finvizLoading, setFinvizLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finvizError, setFinvizError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Calculate market condition
  const marketCondition = useMemo(() => {
    return calculateMarketCondition(breadthData, finvizData);
  }, [breadthData, finvizData]);

  const fetchBreadthData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/breadth`);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setBreadthData(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch breadth data');
      console.error('Error fetching breadth data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFinvizData = useCallback(async () => {
    try {
      setFinvizError(null);
      const response = await fetch(`${API_BASE}/breadth-daily`);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setFinvizData(data);
    } catch (err) {
      setFinvizError(err instanceof Error ? err.message : 'Failed to fetch Finviz data');
      console.error('Error fetching Finviz data:', err);
    } finally {
      setFinvizLoading(false);
    }
  }, []);

  const fetchHistoryData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/breadth-history?days=5`);
      if (response.ok) {
        const data = await response.json();
        setHistoryData(data);
      }
    } catch (err) {
      console.error('Error fetching history data:', err);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchBreadthData();
    fetchFinvizData();
    fetchHistoryData();
  }, [fetchBreadthData, fetchFinvizData, fetchHistoryData]);

  // Auto-refresh during market hours (Polygon only - Finviz is daily)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (isMarketOpen()) {
        fetchBreadthData();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchBreadthData, autoRefresh]);

  const handleRefresh = () => {
    setLoading(true);
    setFinvizLoading(true);
    fetchBreadthData();
    fetchFinvizData();
    fetchHistoryData();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get today's date string in YYYY-MM-DD format (PST timezone)
  const getTodayDateStr = () => {
    const now = new Date();
    // Convert to PST (UTC-8) / PDT (UTC-7)
    const pstOffset = -8 * 60; // PST offset in minutes
    const pdtOffset = -7 * 60; // PDT offset in minutes

    // Check if DST is in effect (roughly March-November)
    const month = now.getUTCMonth();
    const isDST = month >= 2 && month <= 10; // March (2) to November (10)
    const offset = isDST ? pdtOffset : pstOffset;

    const pstTime = new Date(now.getTime() + (now.getTimezoneOffset() + offset) * 60000);
    return pstTime.toISOString().split('T')[0];
  };

  // Check if a date is in the future (relative to PST today)
  const isFutureDate = (dateStr: string) => {
    const todayStr = getTodayDateStr();
    return dateStr > todayStr;
  };

  // Check if a date is a business day (Mon-Fri)
  const isBusinessDay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return day !== 0 && day !== 6;
  };

  // Build history list: combine today's live data with historical data, filter to business days only
  const buildRealtimeHistory = () => {
    const items: { date: string; data: BreadthData }[] = [];
    const seenDates = new Set<string>();

    // Add today's live data first (use server's date, not frontend calculation)
    // This ensures consistency between server PST and what we display
    if (breadthData?.date && isBusinessDay(breadthData.date) && !isFutureDate(breadthData.date)) {
      items.push({ date: breadthData.date, data: breadthData });
      seenDates.add(breadthData.date);
    }

    // Add historical data from Redis (excluding duplicates, weekends, and future dates)
    if (historyData?.realtime) {
      for (const item of historyData.realtime) {
        if (!seenDates.has(item.date) && isBusinessDay(item.date) && !isFutureDate(item.date)) {
          items.push({ date: item.date, data: item.data as BreadthData });
          seenDates.add(item.date);
        }
      }
    }

    // Sort by date descending and limit to 5 business days
    return items
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  };

  // Build Finviz history list
  const buildFinvizHistory = () => {
    const items: { date: string; data: FinvizBreadthData }[] = [];
    const seenDates = new Set<string>();

    // Add today's live Finviz data first (use server's date, not frontend calculation)
    // This ensures consistency between server PST and what we display
    if (finvizData?.date && isBusinessDay(finvizData.date) && !isFutureDate(finvizData.date)) {
      items.push({ date: finvizData.date, data: finvizData });
      seenDates.add(finvizData.date);
    }

    // Add historical data from Redis (excluding duplicates, weekends, and future dates)
    if (historyData?.daily) {
      for (const item of historyData.daily) {
        if (!seenDates.has(item.date) && isBusinessDay(item.date) && !isFutureDate(item.date)) {
          items.push({ date: item.date, data: item.data as FinvizBreadthData });
          seenDates.add(item.date);
        }
      }
    }

    // Sort by date descending and limit to 5 business days
    return items
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  };

  // Helper to render a metric cell with color
  const MetricCell = ({ value, type, label }: { value: number | null | undefined; type: 'up' | 'down' | 'ratio' | 'neutral'; label?: string }) => {
    let bgColor = 'bg-gray-700';
    let textColor = 'text-gray-500';

    if (value != null) {
      if (type === 'up') {
        bgColor = 'bg-green-500/20';
        textColor = 'text-green-400';
      } else if (type === 'down') {
        bgColor = 'bg-red-500/20';
        textColor = 'text-red-400';
      } else if (type === 'ratio') {
        if (value > 1) {
          bgColor = 'bg-green-500/20';
          textColor = 'text-green-400';
        } else if (value < 1) {
          bgColor = 'bg-red-500/20';
          textColor = 'text-red-400';
        } else {
          bgColor = 'bg-yellow-500/20';
          textColor = 'text-yellow-400';
        }
      } else {
        bgColor = 'bg-blue-500/20';
        textColor = 'text-blue-400';
      }
    }

    return (
      <div className={`${bgColor} ${textColor} px-3 py-2 rounded-lg text-center`}>
        <div className="font-bold text-lg">{value ?? '--'}</div>
        {label && <div className="text-xs opacity-75">{label}</div>}
      </div>
    );
  };

  // Helper for history table cell styling
  const getHistoryCellClass = (value: number | null | undefined, type: 'up' | 'down' | 'ratio') => {
    if (value == null) return 'text-gray-500';
    if (type === 'up') return 'text-green-400';
    if (type === 'down') return 'text-red-400';
    if (type === 'ratio') {
      if (value > 1) return 'text-green-400';
      if (value < 1) return 'text-red-400';
      return 'text-yellow-400';
    }
    return 'text-gray-300';
  };

  if (loading && !breadthData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
        <div className="text-center">
          <div className="text-white font-medium">Loading Market Breadth</div>
          <div className="text-gray-500 text-sm mt-1">
            {isMarketOpen()
              ? 'Fetching live data from 500+ stocks...'
              : 'Loading cached market data...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Market Breadth Dashboard</h2>
            <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
              {breadthData?.market && (
                <span className="text-gray-400">
                  SPY: <span className="text-white font-medium">${breadthData.market.spyValue.toFixed(2)}</span>
                  <span className={`ml-1 ${breadthData.market.spyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({breadthData.market.spyChangePercent >= 0 ? '+' : ''}{breadthData.market.spyChangePercent.toFixed(2)}%)
                  </span>
                </span>
              )}
              {breadthData?.t2108 != null && (
                <span className="text-gray-400">
                  T2108: <span className={`font-medium ${
                    breadthData.t2108 > 70 ? 'text-red-400' :
                    breadthData.t2108 < 30 ? 'text-green-400' :
                    'text-yellow-400'
                  }`}>{breadthData.t2108}%</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {breadthData?.marketClosed && (
              <span className="px-2 py-1 bg-yellow-900/40 border border-yellow-700/50 rounded text-xs text-yellow-400">
                Market Closed - Cached Data
              </span>
            )}
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                Updated: {formatTime(lastUpdate)}
              </span>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={loading || finvizLoading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
            >
              {loading || finvizLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {(error || finvizError) && (
          <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
            {error || finvizError}
          </div>
        )}
      </div>

      {/* Market Condition Indicator */}
      <div className={`rounded-xl p-5 border-2 ${
        marketCondition.condition === 'ALL_IN'
          ? 'bg-gradient-to-r from-green-900/40 to-emerald-900/40 border-green-500/50'
          : marketCondition.condition === 'STAY_50'
          ? 'bg-gradient-to-r from-yellow-900/40 to-amber-900/40 border-yellow-500/50'
          : 'bg-gradient-to-r from-red-900/40 to-rose-900/40 border-red-500/50'
      }`}>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Main Indicator */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              marketCondition.condition === 'ALL_IN'
                ? 'bg-green-500/30 ring-4 ring-green-500/50'
                : marketCondition.condition === 'STAY_50'
                ? 'bg-yellow-500/30 ring-4 ring-yellow-500/50'
                : 'bg-red-500/30 ring-4 ring-red-500/50'
            }`}>
              {marketCondition.condition === 'ALL_IN' ? (
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              ) : marketCondition.condition === 'STAY_50' ? (
                <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              )}
            </div>
            <div>
              <div className="text-sm text-gray-400 uppercase tracking-wide">Market Condition</div>
              <div className={`text-2xl font-bold ${
                marketCondition.condition === 'ALL_IN'
                  ? 'text-green-400'
                  : marketCondition.condition === 'STAY_50'
                  ? 'text-yellow-400'
                  : 'text-red-400'
              }`}>
                {marketCondition.condition === 'ALL_IN' && 'ALL IN'}
                {marketCondition.condition === 'STAY_50' && 'STAY INVESTED 50%'}
                {marketCondition.condition === 'GET_OUT' && 'GET OUT / STAY OUT'}
              </div>
              <div className="text-sm text-gray-500">
                Score: {marketCondition.score} / {marketCondition.maxScore}
              </div>
            </div>
          </div>

          {/* Score Bar */}
          <div className="w-full lg:w-64">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Bearish</span>
              <span>Neutral</span>
              <span>Bullish</span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden relative">
              {/* Background gradient */}
              <div className="absolute inset-0 flex">
                <div className="w-1/3 bg-red-600/30"></div>
                <div className="w-1/3 bg-yellow-600/30"></div>
                <div className="w-1/3 bg-green-600/30"></div>
              </div>
              {/* Score indicator */}
              <div
                className={`absolute top-0 bottom-0 w-2 rounded-full transform -translate-x-1/2 ${
                  marketCondition.condition === 'ALL_IN'
                    ? 'bg-green-400'
                    : marketCondition.condition === 'STAY_50'
                    ? 'bg-yellow-400'
                    : 'bg-red-400'
                }`}
                style={{
                  left: `${Math.min(100, Math.max(0, ((marketCondition.score + 14) / 28) * 100))}%`
                }}
              ></div>
            </div>
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>-14</span>
              <span>0</span>
              <span>+14</span>
            </div>
          </div>

          {/* Signal Summary */}
          <div className="text-sm space-y-1 min-w-[200px]">
            {marketCondition.signals.bullish.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-gray-400">{marketCondition.signals.bullish.length} bullish signals</span>
              </div>
            )}
            {marketCondition.signals.neutral.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="text-gray-400">{marketCondition.signals.neutral.length} neutral signals</span>
              </div>
            )}
            {marketCondition.signals.bearish.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-gray-400">{marketCondition.signals.bearish.length} bearish signals</span>
              </div>
            )}
          </div>
        </div>

        {/* Expandable Signal Details */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-300">
            View Signal Details
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Bullish Signals */}
            <div className="bg-green-900/20 rounded-lg p-3">
              <div className="text-xs font-semibold text-green-400 mb-2 uppercase">Bullish Signals</div>
              {marketCondition.signals.bullish.length > 0 ? (
                <ul className="text-xs text-gray-400 space-y-1">
                  {marketCondition.signals.bullish.map((signal, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="text-green-400 mt-0.5">+</span>
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-500">No bullish signals</div>
              )}
            </div>

            {/* Neutral Signals */}
            <div className="bg-yellow-900/20 rounded-lg p-3">
              <div className="text-xs font-semibold text-yellow-400 mb-2 uppercase">Neutral Signals</div>
              {marketCondition.signals.neutral.length > 0 ? (
                <ul className="text-xs text-gray-400 space-y-1">
                  {marketCondition.signals.neutral.map((signal, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="text-yellow-400 mt-0.5">=</span>
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-500">No neutral signals</div>
              )}
            </div>

            {/* Bearish Signals */}
            <div className="bg-red-900/20 rounded-lg p-3">
              <div className="text-xs font-semibold text-red-400 mb-2 uppercase">Bearish Signals</div>
              {marketCondition.signals.bearish.length > 0 ? (
                <ul className="text-xs text-gray-400 space-y-1">
                  {marketCondition.signals.bearish.map((signal, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <span className="text-red-400 mt-0.5">-</span>
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-gray-500">No bearish signals</div>
              )}
            </div>
          </div>

          {/* Methodology Note */}
          <div className="mt-3 p-2 bg-gray-800/50 rounded text-xs text-gray-500">
            <strong className="text-gray-400">Methodology:</strong> Scores multiple breadth indicators including T2108, rolling ratios,
            new highs/lows, and SMA positioning. Score range: -14 (extreme bearish) to +14 (extreme bullish).
            <br/>
            <strong className="text-gray-400">Thresholds:</strong> ALL IN (score {'>'}= 5), STAY 50% (-2 to 4), GET OUT ({'<'} -2)
          </div>
        </details>
      </div>

      {/* Main Content - Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* LEFT SIDE: Polygon Real-Time Data */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Real-Time Breadth</h3>
              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                Polygon API | {breadthData?.universeCount || 0} stocks
              </span>
            </div>

            {/* Daily Movers */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Daily Movers (4%+ Change)</h4>
              <div className="grid grid-cols-2 gap-3">
                <MetricCell value={breadthData?.primary.up4PlusToday} type="up" label="Up 4%+" />
                <MetricCell value={breadthData?.primary.down4PlusToday} type="down" label="Down 4%+" />
              </div>
            </div>

            {/* Rolling Ratios */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Rolling Up/Down Ratios</h4>
              <div className="grid grid-cols-2 gap-3">
                <MetricCell value={breadthData?.primary.ratio5Day} type="ratio" label="5-Day" />
                <MetricCell value={breadthData?.primary.ratio10Day} type="ratio" label="10-Day" />
              </div>
            </div>

            {/* Quarterly */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Quarter Performance (63 Days)</h4>
              <div className="grid grid-cols-2 gap-3">
                <MetricCell value={breadthData?.primary.up25PlusQuarter} type="up" label="Up 25%+" />
                <MetricCell value={breadthData?.primary.down25PlusQuarter} type="down" label="Down 25%+" />
              </div>
            </div>

            {/* Monthly */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Month Performance (21 Days)</h4>
              <div className="grid grid-cols-4 gap-2">
                <MetricCell value={breadthData?.secondary.up25PlusMonth} type="up" label="Up 25%" />
                <MetricCell value={breadthData?.secondary.down25PlusMonth} type="down" label="Dn 25%" />
                <MetricCell value={breadthData?.secondary.up50PlusMonth} type="up" label="Up 50%" />
                <MetricCell value={breadthData?.secondary.down50PlusMonth} type="down" label="Dn 50%" />
              </div>
            </div>

            {/* 34-Day */}
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-2">34-Day Performance</h4>
              <div className="grid grid-cols-2 gap-3">
                <MetricCell value={breadthData?.secondary.up13Plus34Days} type="up" label="Up 13%+" />
                <MetricCell value={breadthData?.secondary.down13Plus34Days} type="down" label="Down 13%+" />
              </div>
            </div>
          </div>

          {/* Real-Time History Table */}
          {buildRealtimeHistory().length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3">5-Day History (Real-Time)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-2 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">Up 4%</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">Dn 4%</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">5D Ratio</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">T2108</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildRealtimeHistory().map((item) => {
                      const data = item.data;
                      return (
                        <tr key={item.date} className="border-b border-gray-700/50">
                          <td className="px-2 py-2 text-gray-300">{formatDate(item.date)}</td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.primary?.up4PlusToday, 'up')}`}>
                            {data.primary?.up4PlusToday ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.primary?.down4PlusToday, 'down')}`}>
                            {data.primary?.down4PlusToday ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.primary?.ratio5Day, 'ratio')}`}>
                            {data.primary?.ratio5Day ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${
                            data.t2108 != null
                              ? data.t2108 > 70 ? 'text-red-400' : data.t2108 < 30 ? 'text-green-400' : 'text-yellow-400'
                              : 'text-gray-500'
                          }`}>
                            {data.t2108 != null ? `${data.t2108}%` : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDE: Finviz Daily Data */}
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Technical Breadth</h3>
              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                Finviz Daily | {finvizData?.universeCount || 0} stocks
              </span>
            </div>

            {finvizLoading && !finvizData ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-gray-400">Loading Finviz data...</div>
              </div>
            ) : finvizError && !finvizData ? (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
                {finvizError}
              </div>
            ) : (
              <>
                {/* 52-Week Highs/Lows */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">52-Week Highs & Lows</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <MetricCell value={finvizData?.highs.new52WeekHigh} type="up" label="New Highs" />
                    <MetricCell value={finvizData?.highs.new52WeekLow} type="down" label="New Lows" />
                    <MetricCell value={finvizData?.highs.highLowRatio} type="ratio" label="H/L Ratio" />
                  </div>
                </div>

                {/* RSI */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">RSI Extremes</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <MetricCell value={finvizData?.rsi.above70} type="down" label="RSI > 70" />
                    <MetricCell value={finvizData?.rsi.below30} type="up" label="RSI < 30" />
                    <MetricCell value={finvizData?.rsi.rsiRatio} type="ratio" label="OB/OS Ratio" />
                  </div>
                </div>

                {/* SMA Breadth */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Price vs Moving Averages</h4>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <MetricCell value={finvizData?.sma.aboveSMA20} type="up" label="> SMA 20" />
                    <MetricCell value={finvizData?.sma.belowSMA20} type="down" label="< SMA 20" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <MetricCell value={finvizData?.sma.aboveSMA50} type="up" label="> SMA 50" />
                    <MetricCell value={finvizData?.sma.belowSMA50} type="down" label="< SMA 50" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCell value={finvizData?.sma.aboveSMA200} type="up" label="> SMA 200" />
                    <MetricCell value={finvizData?.sma.belowSMA200} type="down" label="< SMA 200" />
                  </div>
                </div>

                {/* Trend */}
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Trend Signals (SMA 50/200)</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCell value={finvizData?.trend.goldenCross} type="up" label="Golden Cross" />
                    <MetricCell value={finvizData?.trend.deathCross} type="down" label="Death Cross" />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Finviz History Table */}
          {buildFinvizHistory().length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-3">5-Day History (Technical)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="px-2 py-2 text-left text-xs text-gray-500">Date</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">Highs</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">Lows</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">H/L</th>
                      <th className="px-2 py-2 text-center text-xs text-gray-500">&gt;SMA200</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildFinvizHistory().map((item) => {
                      const data = item.data;
                      return (
                        <tr key={item.date} className="border-b border-gray-700/50">
                          <td className="px-2 py-2 text-gray-300">{formatDate(item.date)}</td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.highs?.new52WeekHigh, 'up')}`}>
                            {data.highs?.new52WeekHigh ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.highs?.new52WeekLow, 'down')}`}>
                            {data.highs?.new52WeekLow ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.highs?.highLowRatio, 'ratio')}`}>
                            {data.highs?.highLowRatio ?? '--'}
                          </td>
                          <td className={`px-2 py-2 text-center ${getHistoryCellClass(data.sma?.aboveSMA200, 'up')}`}>
                            {data.sma?.aboveSMA200 ?? '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Real-Time Indicators (Polygon)</h4>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Updates every 5 minutes during market hours</li>
            <li>T2108 = % above 40-day MA (<span className="text-green-400">&lt;30%</span> oversold, <span className="text-red-400">&gt;70%</span> overbought)</li>
            <li>Rolling ratios = sum(up 4%+) / sum(down 4%+) over N days</li>
            <li><span className="text-green-400">Green</span> = bullish, <span className="text-red-400">Red</span> = bearish, <span className="text-yellow-400">Yellow</span> = neutral</li>
          </ul>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Technical Indicators (Finviz)</h4>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>Daily snapshot of entire US market (NASDAQ, NYSE, AMEX)</li>
            <li>RSI &gt; 70 = overbought (bearish), RSI &lt; 30 = oversold (bullish)</li>
            <li>Golden Cross = SMA50 crossed above SMA200 (bullish)</li>
            <li>Death Cross = SMA50 crossed below SMA200 (bearish)</li>
          </ul>
        </div>
      </div>

      {/* Redis Cache Info */}
      <div className="bg-gray-800/30 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-600">
          Data cached with Redis for faster loading. History requires Redis configuration (REDIS_CONNECTION_STRING).
        </p>
      </div>
    </div>
  );
}
