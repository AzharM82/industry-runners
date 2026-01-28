import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SectorRotationData, SectorSummary, SectorRotationStock } from '../types';

const API_BASE = '/api';

interface TooltipData {
  stock: SectorRotationStock;
  x: number;
  y: number;
}

export function SectorRotationView() {
  const [data, setData] = useState<SectorRotationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly'>('daily');
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const url = `${API_BASE}/sector-rotation?timeframe=${timeframe}${refresh ? '&refresh=true' : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sector rotation data');
      console.error('Error fetching sector rotation:', err);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate chart dimensions and scales
  const chartConfig = useMemo(() => {
    if (!data) return null;

    const allChanges = data.sectors.flatMap(s => s.stocks.map(st => st.changePercent));
    const maxChange = Math.max(15, Math.ceil(Math.max(...allChanges, 0) / 5) * 5);
    const minChange = Math.min(-15, Math.floor(Math.min(...allChanges, 0) / 5) * 5);

    return {
      width: 1200,
      height: 500,
      padding: { top: 40, right: 60, bottom: 80, left: 60 },
      maxChange,
      minChange,
      sectorCount: data.sectors.length
    };
  }, [data]);

  // Get bubble radius based on relative volume
  const getRadius = (relativeVolume: number) => {
    // relativeVolume = volume / avgVolume
    // 0.5x avg -> 4px, 1x avg -> 8px, 2x avg -> 16px
    return Math.min(20, Math.max(4, 4 + (relativeVolume - 0.5) * 8));
  };

  // Map Y value (% change) to pixel position
  const getY = (changePercent: number) => {
    if (!chartConfig) return 0;
    const { height, padding, maxChange, minChange } = chartConfig;
    const chartHeight = height - padding.top - padding.bottom;
    const range = maxChange - minChange;
    return padding.top + ((maxChange - changePercent) / range) * chartHeight;
  };

  // Get X position for a sector
  const getSectorX = (sectorIndex: number) => {
    if (!chartConfig) return 0;
    const { width, padding, sectorCount } = chartConfig;
    const chartWidth = width - padding.left - padding.right;
    const sectorWidth = chartWidth / sectorCount;
    return padding.left + sectorIndex * sectorWidth + sectorWidth / 2;
  };

  // Get bubble color
  const getBubbleColor = (changePercent: number) => {
    if (changePercent > 0) {
      return 'rgba(34, 197, 94, 0.8)'; // green
    } else if (changePercent < 0) {
      return 'rgba(239, 68, 68, 0.8)'; // red
    }
    return 'rgba(156, 163, 175, 0.8)'; // gray
  };

  // Add jitter to avoid overlapping bubbles
  const getJitter = (index: number, total: number) => {
    const spread = 30; // max pixels from center
    if (total <= 1) return 0;
    // Distribute bubbles in a pattern
    const angle = (index / total) * Math.PI * 2;
    return Math.sin(angle) * spread * (index % 2 === 0 ? 1 : 0.5);
  };

  const handleBubbleMouseEnter = (stock: SectorRotationStock, event: React.MouseEvent) => {
    const rect = (event.target as SVGElement).getBoundingClientRect();
    setTooltip({
      stock,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  };

  const handleBubbleMouseLeave = () => {
    setTooltip(null);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-400">Loading sector rotation data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/50 border border-red-800 rounded-lg p-4 text-red-200">
        {error}
        <button
          onClick={() => fetchData(true)}
          className="ml-4 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || !chartConfig) {
    return (
      <div className="text-gray-400 text-center py-8">
        No sector rotation data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Sector Rotation</h2>
        <div className="flex items-center gap-4">
          {/* Timeframe Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setTimeframe('daily')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                timeframe === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTimeframe('weekly')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                timeframe === 'weekly'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Weekly
            </button>
          </div>
          {/* Refresh Button */}
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white text-sm rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Bubble Chart */}
      <div className="bg-gray-800 rounded-xl p-4 overflow-x-auto">
        <svg
          width={chartConfig.width}
          height={chartConfig.height}
          className="mx-auto"
          style={{ minWidth: chartConfig.width }}
        >
          {/* Y-axis grid lines and labels */}
          {[-15, -10, -5, 0, 5, 10, 15].filter(v => v >= chartConfig.minChange && v <= chartConfig.maxChange).map(value => {
            const y = getY(value);
            return (
              <g key={value}>
                <line
                  x1={chartConfig.padding.left}
                  y1={y}
                  x2={chartConfig.width - chartConfig.padding.right}
                  y2={y}
                  stroke={value === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}
                  strokeWidth={value === 0 ? 2 : 1}
                />
                <text
                  x={chartConfig.padding.left - 10}
                  y={y + 4}
                  fill="#9CA3AF"
                  fontSize={12}
                  textAnchor="end"
                >
                  {value > 0 ? '+' : ''}{value}%
                </text>
                <text
                  x={chartConfig.width - chartConfig.padding.right + 10}
                  y={y + 4}
                  fill="#9CA3AF"
                  fontSize={12}
                  textAnchor="start"
                >
                  {value > 0 ? '+' : ''}{value}%
                </text>
              </g>
            );
          })}

          {/* Sector columns and bubbles */}
          {data.sectors.map((sector, sectorIndex) => {
            const x = getSectorX(sectorIndex);

            return (
              <g key={sector.name}>
                {/* Sector separator line */}
                {sectorIndex > 0 && (
                  <line
                    x1={x - (chartConfig.width - chartConfig.padding.left - chartConfig.padding.right) / (chartConfig.sectorCount * 2)}
                    y1={chartConfig.padding.top}
                    x2={x - (chartConfig.width - chartConfig.padding.left - chartConfig.padding.right) / (chartConfig.sectorCount * 2)}
                    y2={chartConfig.height - chartConfig.padding.bottom}
                    stroke="rgba(255,255,255,0.05)"
                    strokeDasharray="4,4"
                  />
                )}

                {/* Stock bubbles */}
                {sector.stocks.map((stock, stockIndex) => {
                  const bubbleX = x + getJitter(stockIndex, sector.stocks.length);
                  const bubbleY = getY(stock.changePercent);
                  const radius = getRadius(stock.relativeVolume);
                  const color = getBubbleColor(stock.changePercent);

                  return (
                    <g key={stock.symbol}>
                      <circle
                        cx={bubbleX}
                        cy={bubbleY}
                        r={radius}
                        fill={color}
                        stroke={stock.isNewHigh ? '#FFD700' : stock.isNewLow ? '#FF6B6B' : 'transparent'}
                        strokeWidth={2}
                        className="cursor-pointer transition-all hover:opacity-80"
                        onMouseEnter={(e) => handleBubbleMouseEnter(stock, e)}
                        onMouseLeave={handleBubbleMouseLeave}
                      />
                      {/* Symbol label for larger bubbles */}
                      {radius >= 8 && (
                        <text
                          x={bubbleX}
                          y={bubbleY + radius + 12}
                          fill="#9CA3AF"
                          fontSize={9}
                          textAnchor="middle"
                          className="pointer-events-none"
                        >
                          {stock.symbol}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Sector label */}
                <text
                  x={x}
                  y={chartConfig.height - chartConfig.padding.bottom + 20}
                  fill="white"
                  fontSize={11}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {sector.shortName}
                </text>

                {/* Sector average change */}
                <text
                  x={x}
                  y={chartConfig.height - chartConfig.padding.bottom + 38}
                  fill={sector.avgChange >= 0 ? '#22C55E' : '#EF4444'}
                  fontSize={11}
                  textAnchor="middle"
                >
                  {sector.avgChange >= 0 ? '+' : ''}{sector.avgChange.toFixed(1)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="text-white font-bold">{tooltip.stock.symbol}</div>
          <div className={tooltip.stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
            {tooltip.stock.changePercent >= 0 ? '+' : ''}{tooltip.stock.changePercent.toFixed(2)}%
          </div>
          <div className="text-gray-400 text-sm">
            Price: ${tooltip.stock.price.toFixed(2)}
          </div>
          <div className="text-gray-400 text-sm">
            Vol: {(tooltip.stock.relativeVolume).toFixed(1)}x avg
          </div>
          {tooltip.stock.isNewHigh && (
            <div className="text-yellow-400 text-sm">52W High</div>
          )}
          {tooltip.stock.isNewLow && (
            <div className="text-red-400 text-sm">52W Low</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500/80"></div>
          <span>Positive</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-red-500/80"></div>
          <span>Negative</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-yellow-400 bg-transparent"></div>
          <span>52W High</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-500/50"></div>
          <span>High Volume</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-500/50"></div>
          <span>Low Volume</span>
        </div>
      </div>

      {/* New Highs / New Lows Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">New Highs / New Lows by Sector</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase">Metric</th>
                {data.sectors.map(sector => (
                  <th key={sector.shortName} className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">
                    {sector.shortName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-3 text-sm text-gray-300">New High</td>
                {data.sectors.map(sector => (
                  <td key={`high-${sector.shortName}`} className="px-3 py-3 text-center">
                    <span className={`text-sm font-medium ${sector.newHighs > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                      {sector.newHighs}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-gray-700">
                <td className="px-4 py-3 text-sm text-gray-300">New Low</td>
                {data.sectors.map(sector => (
                  <td key={`low-${sector.shortName}`} className="px-3 py-3 text-center">
                    <span className={`text-sm font-medium ${sector.newLows > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {sector.newLows}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Sector Details (Collapsible) */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Sector Details</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
          {data.sectors.map(sector => (
            <SectorCard key={sector.name} sector={sector} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Sector Card Component
function SectorCard({ sector }: { sector: SectorSummary }) {
  const [expanded, setExpanded] = useState(false);

  // Sort stocks by change percent
  const sortedStocks = [...sector.stocks].sort((a, b) => b.changePercent - a.changePercent);
  const displayStocks = expanded ? sortedStocks : sortedStocks.slice(0, 5);

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <span className="font-medium text-white">{sector.name}</span>
          <span className={`ml-2 text-sm ${sector.avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {sector.avgChange >= 0 ? '+' : ''}{sector.avgChange.toFixed(2)}%
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <div className="px-3 pb-2">
        {displayStocks.map(stock => (
          <div key={stock.symbol} className="flex items-center justify-between py-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-300">{stock.symbol}</span>
              {stock.isNewHigh && (
                <span className="text-xs text-yellow-400">HI</span>
              )}
              {stock.isNewLow && (
                <span className="text-xs text-red-400">LO</span>
              )}
            </div>
            <span className={stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
              {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
            </span>
          </div>
        ))}
        {!expanded && sortedStocks.length > 5 && (
          <div className="text-xs text-gray-500 text-center pt-1">
            +{sortedStocks.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
}
