import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { FocusStock } from '../types';
import { getFocusStockSymbols } from '../data/focusstocks';

const API_BASE = '/api';

interface BubbleData {
  symbol: string;
  x: number; // Relative Volume
  y: number; // Change from Open %
  z: number; // Bubble size (relative volume normalized)
  stock: FocusStock;
}

export function FocusStocksView() {
  const [stocks, setStocks] = useState<FocusStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFocusStocks = useCallback(async () => {
    try {
      setError(null);
      const symbols = getFocusStockSymbols();

      const response = await fetch(`${API_BASE}/focusstocks?symbols=${symbols.join(',')}`);

      if (!response.ok) {
        throw new Error('Failed to fetch focus stocks data');
      }

      const data = await response.json();
      setStocks(data.stocks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFocusStocks();
  }, [fetchFocusStocks]);

  // Transform data for bubble chart
  const bubbleData = useMemo((): BubbleData[] => {
    if (stocks.length === 0) return [];

    // Find max relative volume for size normalization
    const maxRelVol = Math.max(...stocks.map(s => s.relativeVolume || 0));

    return stocks
      .filter(stock => stock.relativeVolume > 0) // Only show stocks with valid relative volume
      .map(stock => ({
        symbol: stock.symbol,
        x: stock.relativeVolume,
        y: stock.changeFromOpenPercent,
        z: maxRelVol > 0 ? (stock.relativeVolume / maxRelVol) * 100 : 10,
        stock,
      }));
  }, [stocks]);

  // Calculate domain bounds
  const { xDomain, yDomain } = useMemo(() => {
    if (bubbleData.length === 0) {
      return { xDomain: [0, 2], yDomain: [-5, 5] };
    }

    const xValues = bubbleData.map(d => d.x);
    const yValues = bubbleData.map(d => d.y);

    const xMin = Math.floor(Math.min(...xValues) * 10) / 10;
    const xMax = Math.ceil(Math.max(...xValues) * 10) / 10;
    const yMin = Math.floor(Math.min(...yValues));
    const yMax = Math.ceil(Math.max(...yValues));

    return {
      xDomain: [Math.max(0, xMin - 0.1), xMax + 0.1],
      yDomain: [yMin - 0.5, yMax + 0.5],
    };
  }, [bubbleData]);

  // Get color based on change percentage
  const getColor = (changePercent: number): string => {
    if (changePercent > 2) return '#22c55e'; // Strong green
    if (changePercent > 0) return '#4ade80'; // Light green
    if (changePercent > -2) return '#f87171'; // Light red
    return '#ef4444'; // Strong red
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: BubbleData }> }) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    const stock = data.stock;
    const isPositive = stock.changeFromOpenPercent >= 0;

    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-xl min-w-[200px]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-white">{stock.symbol}</span>
          <span className="text-lg font-bold text-white">${stock.last.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-400">Change</span>
            <div className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {isPositive ? '+' : ''}{stock.change.toFixed(2)} ({isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%)
            </div>
          </div>
          <div>
            <span className="text-gray-400">From Open</span>
            <div className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {isPositive ? '+' : ''}{stock.changeFromOpenPercent.toFixed(2)}%
            </div>
          </div>
          <div>
            <span className="text-gray-400">Rel. Volume</span>
            <div className="text-white">{stock.relativeVolume.toFixed(2)}x</div>
          </div>
          <div>
            <span className="text-gray-400">Volume</span>
            <div className="text-white">{formatVolume(stock.volume)}</div>
          </div>
          <div>
            <span className="text-gray-400">Open</span>
            <div className="text-white">${stock.open.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-gray-400">Prev Close</span>
            <div className="text-white">${stock.previousClose.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-gray-400">High</span>
            <div className="text-white">${stock.high.toFixed(2)}</div>
          </div>
          <div>
            <span className="text-gray-400">Low</span>
            <div className="text-white">${stock.low.toFixed(2)}</div>
          </div>
        </div>
      </div>
    );
  };

  const formatVolume = (vol: number): string => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
    return vol.toString();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-4 text-gray-400">Loading focus stocks data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 max-w-md text-center">
          <p className="text-red-300">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchFocusStocks();
            }}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Focus Stocks Bubble Chart</h2>
          <p className="text-sm text-gray-400">
            Size: Relative Volume | Color: Change | {stocks.length} stocks
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchFocusStocks();
          }}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm rounded-lg"
        >
          Refresh
        </button>
      </div>

      {/* Chart */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="h-[600px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 80, bottom: 60, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                type="number"
                dataKey="x"
                name="Relative Volume"
                domain={xDomain}
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickFormatter={(value) => value.toFixed(1)}
                label={{
                  value: 'Relative Volume',
                  position: 'bottom',
                  offset: 40,
                  fill: '#9ca3af',
                }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Change from Open %"
                domain={yDomain}
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickFormatter={(value) => `${value.toFixed(1)}%`}
                label={{
                  value: 'Change from Open',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -10,
                  fill: '#9ca3af',
                }}
              />
              <ZAxis type="number" dataKey="z" range={[20, 400]} />
              <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="5 5" />
              <ReferenceLine x={1} stroke="#6b7280" strokeDasharray="5 5" />
              <Scatter
                data={bubbleData}
                fill="#8884d8"
              >
                {bubbleData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColor(entry.y)}
                    fillOpacity={0.7}
                    stroke={getColor(entry.y)}
                    strokeWidth={1}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span>Positive change</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>Negative change</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Bubble size = Relative Volume</span>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Above Avg Volume"
          value={bubbleData.filter(d => d.x > 1).length}
          total={bubbleData.length}
        />
        <StatCard
          label="Positive Change"
          value={bubbleData.filter(d => d.y > 0).length}
          total={bubbleData.length}
        />
        <StatCard
          label="High RVol (>1.5x)"
          value={bubbleData.filter(d => d.x > 1.5).length}
          total={bubbleData.length}
        />
        <StatCard
          label="Strong Move (>2%)"
          value={bubbleData.filter(d => Math.abs(d.y) > 2).length}
          total={bubbleData.length}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(0) : '0';

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-white mt-1">
        {value} <span className="text-sm text-gray-500">/ {total}</span>
      </div>
      <div className="text-sm text-gray-400">{percentage}%</div>
    </div>
  );
}
