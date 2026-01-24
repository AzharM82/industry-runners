import { useState, useEffect, useCallback } from 'react';
import type { BreadthData } from '../types';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // Initial fetch
  useEffect(() => {
    fetchBreadthData();
  }, [fetchBreadthData]);

  // Auto-refresh during market hours
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
    fetchBreadthData();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (loading && !breadthData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading breadth indicators...</div>
      </div>
    );
  }

  if (error && !breadthData) {
    return (
      <div className="p-4">
        <div className="p-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200">
          {error}
        </div>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">Breadth Indicators</h2>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-gray-400">
                Universe: <span className="text-white font-medium">{breadthData?.universeCount || 0} stocks</span>
              </span>
              {breadthData?.market && (
                <span className="text-gray-400">
                  SPY: <span className="text-white font-medium">${breadthData.market.spyValue.toFixed(2)}</span>
                  <span className={`ml-1 ${breadthData.market.spyChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ({breadthData.market.spyChangePercent >= 0 ? '+' : ''}{breadthData.market.spyChangePercent.toFixed(2)}%)
                  </span>
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
              disabled={loading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-2 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Primary Breadth Indicators */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Primary Breadth Indicators</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Up 4%+ Today</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Down 4%+ Today</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">5D Ratio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">10D Ratio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Up 25%+ Qtr</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Down 25%+ Qtr</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-4">
                  <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.up4PlusToday ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.down4PlusToday ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-gray-700 text-gray-500 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.ratio5Day ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-gray-700 text-gray-500 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.ratio10Day ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.up25PlusQuarter ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.primary.down25PlusQuarter ?? '--'}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Secondary Breadth Indicators */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Secondary Breadth Indicators</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Up 25%+ Month</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Down 25%+ Month</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Up 50%+ Month</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Down 50%+ Month</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Up 13%+ 34D</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Down 13%+ 34D</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-4">
                  <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.up25PlusMonth ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.down25PlusMonth ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.up50PlusMonth ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.down50PlusMonth ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-green-500/20 text-green-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.up13Plus34Days ?? '--'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="bg-red-500/20 text-red-400 px-3 py-2 rounded-lg text-center font-bold text-lg">
                    {breadthData?.secondary.down13Plus34Days ?? '--'}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-gray-800/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-400 mb-2">About Breadth Indicators</h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li><span className="text-green-400">Green cells</span> = Bullish signal (stocks up by threshold)</li>
          <li><span className="text-red-400">Red cells</span> = Bearish signal (stocks down by threshold)</li>
          <li><span className="text-gray-400">Gray cells</span> = Data not yet available (Phase 2 features)</li>
          <li>Quarter = 63 trading days, Month = 21 trading days</li>
          <li>5D/10D Ratios require historical daily data storage (coming in Phase 2)</li>
        </ul>
      </div>
    </div>
  );
}
