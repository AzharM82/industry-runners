import { useState, useEffect, useCallback } from 'react';
import type { BreadthData, FinvizBreadthData, BreadthHistoryResponse } from '../types';

const API_BASE = '/api';
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

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

  // Get today's date string in YYYY-MM-DD format
  const getTodayDateStr = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
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
    const todayStr = getTodayDateStr();
    const seenDates = new Set<string>();

    // Add today's live data first (if it's a business day)
    if (breadthData && isBusinessDay(todayStr)) {
      items.push({ date: todayStr, data: breadthData });
      seenDates.add(todayStr);
    }

    // Add historical data from Redis (excluding duplicates and weekends)
    if (historyData?.realtime) {
      for (const item of historyData.realtime) {
        if (!seenDates.has(item.date) && isBusinessDay(item.date)) {
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
    const todayStr = getTodayDateStr();
    const seenDates = new Set<string>();

    // Add today's live Finviz data first (if it's a business day)
    if (finvizData && isBusinessDay(todayStr)) {
      items.push({ date: todayStr, data: finvizData });
      seenDates.add(todayStr);
    }

    // Add historical data from Redis (excluding duplicates and weekends)
    if (historyData?.daily) {
      for (const item of historyData.daily) {
        if (!seenDates.has(item.date) && isBusinessDay(item.date)) {
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
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading breadth indicators...</div>
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
