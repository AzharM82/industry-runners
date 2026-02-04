import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const API_BASE = '/api';

interface Stock {
  symbol: string;
  changePercent: number;
  price: number;
  volume: number;
}

interface Sector {
  name: string;
  shortName: string;
  avgChange: number;
  stocks: Stock[];
  newHighs?: number;
  newLows?: number;
}

interface SectorData {
  timestamp: number;
  date?: string;
  sectors: Sector[];
  cached?: boolean;
  marketOpen?: boolean;
}

interface TooltipData {
  stock: Stock;
  x: number;
  y: number;
}

interface NHNLDayData {
  date: string;
  sectors: Record<string, { nh: number; nl: number }>;
}

interface NHNLHistory {
  days: NHNLDayData[];
}

// Sector order for the table (fixed)
const SECTOR_ORDER = [
  'Tech', 'Financials', 'Health Care', 'Discretionary', 'Comm Services',
  'Industrials', 'Staples', 'Energy', 'Utilities', 'Materials', 'Real Estate'
];

export function SectorRotationView() {
  const [data, setData] = useState<SectorData | null>(null);
  const [nhnlHistory, setNhnlHistory] = useState<NHNLHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [chartWidth, setChartWidth] = useState(1600);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth - 16;
        setChartWidth(Math.max(1200, width));
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const fetchData = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const url = `${API_BASE}/sector-rotation${refresh ? '?refresh=true' : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      console.error('Error fetching sector rotation:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNHNLHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/sector-rotation?history=true`);
      if (response.ok) {
        const result = await response.json();
        setNhnlHistory(result);
      }
    } catch (err) {
      console.error('Error fetching NH/NL history:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchNHNLHistory();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchData();
      fetchNHNLHistory();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData, fetchNHNLHistory]);

  // Chart configuration - responsive width, taller height
  const chartConfig = useMemo(() => {
    return {
      width: chartWidth,
      height: 700,
      padding: { top: 30, right: 40, bottom: 65, left: 40 },
      minChange: -15,
      maxChange: 15
    };
  }, [chartWidth]);

  // Map Y value (% change) to pixel position
  const getY = useCallback((changePercent: number) => {
    const { height, padding, maxChange, minChange } = chartConfig;
    const chartHeight = height - padding.top - padding.bottom;
    const clampedChange = Math.max(minChange, Math.min(maxChange, changePercent));
    return padding.top + ((maxChange - clampedChange) / (maxChange - minChange)) * chartHeight;
  }, [chartConfig]);

  // Get X position for a stock within a sector
  const getStockX = useCallback((sectorIndex: number, stockIndex: number, totalStocks: number, sectorCount: number) => {
    const { width, padding } = chartConfig;
    const chartWidth = width - padding.left - padding.right;
    const sectorWidth = chartWidth / sectorCount;
    const sectorCenter = padding.left + sectorIndex * sectorWidth + sectorWidth / 2;

    // Spread stocks horizontally within the sector column
    const spread = sectorWidth * 0.85;
    const offset = totalStocks > 1
      ? ((stockIndex / (totalStocks - 1)) - 0.5) * spread
      : 0;

    return sectorCenter + offset;
  }, [chartConfig]);

  // Get bubble radius
  const getRadius = useCallback((stock: Stock) => {
    const absChange = Math.abs(stock.changePercent);
    return Math.min(18, Math.max(6, 6 + absChange * 0.8));
  }, []);

  const handleMouseEnter = (stock: Stock, event: React.MouseEvent) => {
    const rect = (event.target as SVGElement).getBoundingClientRect();
    setTooltip({
      stock,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // Format date for display (MM/DD)
  const formatDate = (dateStr: string) => {
    const [, month, day] = dateStr.split('-');
    return `${month}/${day}`;
  };

  // Check if a date is a business day (Mon-Fri)
  const isBusinessDay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0=Sunday, 6=Saturday
  };

  // Filter history to business days only
  const filteredHistoryDays = useMemo(() => {
    return (nhnlHistory?.days || [])
      .filter(day => isBusinessDay(day.date))
      .slice(0, 15);
  }, [nhnlHistory]);

  // Calculate total NH/NL per day for the bar chart
  const dailyTotals = useMemo(() => {
    return filteredHistoryDays.map(day => {
      let totalNH = 0;
      let totalNL = 0;
      Object.values(day.sectors).forEach((s: { nh: number; nl: number }) => {
        totalNH += s.nh;
        totalNL += s.nl;
      });
      return { date: day.date, nh: totalNH, nl: totalNL };
    }).reverse(); // Oldest to newest for chart
  }, [filteredHistoryDays]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96 bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-400">Loading sector data...</div>
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

  if (!data) {
    return <div className="text-gray-400 text-center py-8">No data available</div>;
  }

  // Sort sectors by avgChange (highest to lowest, left to right)
  const sectors = [...data.sectors].sort((a, b) => b.avgChange - a.avgChange);
  const sectorWidth = (chartConfig.width - chartConfig.padding.left - chartConfig.padding.right) / sectors.length;

  return (
    <div ref={containerRef} className="bg-black rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-white">Sector Rotation</h2>
          {data.marketOpen !== undefined && (
            <span className={`text-xs px-2 py-1 rounded ${data.marketOpen ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
              {data.marketOpen ? 'Market Open' : 'Market Closed'}
            </span>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 text-white text-sm rounded transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Bubble Chart */}
      <div className="w-full">
        <svg
          width="100%"
          height={chartConfig.height}
          viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ background: '#0a0a0a' }}
        >
          {/* Sector columns (alternating dark backgrounds) */}
          {sectors.map((_, i) => {
            const x = chartConfig.padding.left + i * sectorWidth;
            return (
              <rect
                key={`bg-${i}`}
                x={x}
                y={chartConfig.padding.top}
                width={sectorWidth}
                height={chartConfig.height - chartConfig.padding.top - chartConfig.padding.bottom}
                fill={i % 2 === 0 ? '#1a1a1a' : '#0f0f0f'}
              />
            );
          })}

          {/* Y-axis grid lines */}
          {[-15, -10, -5, 0, 5, 10, 15].map(value => {
            const y = getY(value);
            return (
              <g key={value}>
                <line
                  x1={chartConfig.padding.left}
                  y1={y}
                  x2={chartConfig.width - chartConfig.padding.right}
                  y2={y}
                  stroke={value === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={value === 0 ? 1 : 0.5}
                />
                {/* Left label */}
                <text
                  x={chartConfig.padding.left - 8}
                  y={y + 5}
                  fill="#888"
                  fontSize={14}
                  fontWeight="500"
                  textAnchor="end"
                >
                  {value > 0 ? '+' : ''}{value}%
                </text>
                {/* Right label */}
                <text
                  x={chartConfig.width - chartConfig.padding.right + 8}
                  y={y + 5}
                  fill="#888"
                  fontSize={14}
                  fontWeight="500"
                  textAnchor="start"
                >
                  {value > 0 ? '+' : ''}{value}%
                </text>
              </g>
            );
          })}

          {/* Stock bubbles */}
          {sectors.map((sector, sectorIndex) => (
            <g key={sector.name}>
              {sector.stocks.map((stock, stockIndex) => {
                const x = getStockX(sectorIndex, stockIndex, sector.stocks.length, sectors.length);
                const y = getY(stock.changePercent);
                const r = getRadius(stock);
                const isPositive = stock.changePercent >= 0;

                return (
                  <g key={stock.symbol}>
                    {/* Bubble - transparent fill with solid stroke */}
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={isPositive ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}
                      stroke={isPositive ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)'}
                      strokeWidth={1.5}
                      className="cursor-pointer transition-opacity hover:opacity-70"
                      onMouseEnter={(e) => handleMouseEnter(stock, e)}
                      onMouseLeave={handleMouseLeave}
                    />
                    {/* Symbol label (only for larger bubbles or significant moves) */}
                    {(Math.abs(stock.changePercent) > 3 || r > 10) && (
                      <text
                        x={x}
                        y={y - r - 4}
                        fill={isPositive ? '#22c55e' : '#ef4444'}
                        fontSize={9}
                        textAnchor="middle"
                        className="pointer-events-none font-medium"
                      >
                        {stock.symbol}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {/* Sector labels and averages at bottom */}
          {sectors.map((sector, i) => {
            const x = chartConfig.padding.left + i * sectorWidth + sectorWidth / 2;
            const y = chartConfig.height - chartConfig.padding.bottom;
            const isPositive = sector.avgChange >= 0;

            return (
              <g key={`label-${sector.name}`}>
                {/* Sector average box */}
                <rect
                  x={x - 32}
                  y={y + 6}
                  width={64}
                  height={26}
                  rx={4}
                  fill={isPositive ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'}
                />
                <text
                  x={x}
                  y={y + 24}
                  fill="white"
                  fontSize={13}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isPositive ? '+' : ''}{sector.avgChange.toFixed(1)}%
                </text>

                {/* Sector name */}
                <text
                  x={x}
                  y={y + 48}
                  fill="#aaa"
                  fontSize={13}
                  fontWeight="500"
                  textAnchor="middle"
                >
                  {sector.shortName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* NH/NL Bar Chart */}
      {dailyTotals.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-white mb-4">Daily New Highs vs New Lows</h3>
          <div className="bg-gray-900/50 rounded-lg p-4">
            <svg width="100%" height="200" viewBox={`0 0 ${Math.max(600, dailyTotals.length * 60)} 200`} preserveAspectRatio="xMidYMid meet">
              {/* Calculate max value for scaling */}
              {(() => {
                const maxVal = Math.max(...dailyTotals.map(d => Math.max(d.nh, d.nl)), 1);
                const barWidth = 20;
                const groupWidth = 50;
                const chartHeight = 150;
                const padding = { left: 40, top: 10, bottom: 40 };

                return (
                  <>
                    {/* Y-axis labels */}
                    {[0, Math.round(maxVal / 2), maxVal].map((val, i) => {
                      const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
                      return (
                        <g key={`y-${i}`}>
                          <text x={padding.left - 8} y={y + 4} fill="#666" fontSize={11} textAnchor="end">
                            {val}
                          </text>
                          <line
                            x1={padding.left}
                            y1={y}
                            x2={padding.left + dailyTotals.length * groupWidth}
                            y2={y}
                            stroke="#333"
                            strokeDasharray="2,2"
                          />
                        </g>
                      );
                    })}

                    {/* Bars */}
                    {dailyTotals.map((day, i) => {
                      const x = padding.left + i * groupWidth + 5;
                      const nhHeight = (day.nh / maxVal) * chartHeight;
                      const nlHeight = (day.nl / maxVal) * chartHeight;

                      return (
                        <g key={day.date}>
                          {/* NH bar (green) */}
                          <rect
                            x={x}
                            y={padding.top + chartHeight - nhHeight}
                            width={barWidth}
                            height={nhHeight}
                            fill="#22c55e"
                            opacity={0.8}
                          />
                          {/* NH value label */}
                          {day.nh > 0 && (
                            <text
                              x={x + barWidth / 2}
                              y={padding.top + chartHeight - nhHeight - 4}
                              fill="#22c55e"
                              fontSize={10}
                              textAnchor="middle"
                            >
                              {day.nh}
                            </text>
                          )}

                          {/* NL bar (red) */}
                          <rect
                            x={x + barWidth + 2}
                            y={padding.top + chartHeight - nlHeight}
                            width={barWidth}
                            height={nlHeight}
                            fill="#ef4444"
                            opacity={0.8}
                          />
                          {/* NL value label */}
                          {day.nl > 0 && (
                            <text
                              x={x + barWidth + 2 + barWidth / 2}
                              y={padding.top + chartHeight - nlHeight - 4}
                              fill="#ef4444"
                              fontSize={10}
                              textAnchor="middle"
                            >
                              {day.nl}
                            </text>
                          )}

                          {/* Date label */}
                          <text
                            x={x + barWidth + 1}
                            y={padding.top + chartHeight + 16}
                            fill="#888"
                            fontSize={10}
                            textAnchor="middle"
                          >
                            {formatDate(day.date)}
                          </text>
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
            <div className="flex justify-center gap-6 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-gray-400">New Highs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-gray-400">New Lows</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NH/NL History Table */}
      {filteredHistoryDays.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-white mb-4">New Highs / New Lows by Sector (Last 15 Business Days)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 py-2 px-2 sticky left-0 bg-black">Date</th>
                  {SECTOR_ORDER.map(sector => (
                    <th key={sector} className="text-center text-gray-400 py-2 px-1 min-w-[70px]">
                      <div className="text-xs">{sector}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistoryDays.map((day, idx) => (
                  <tr key={day.date} className={idx % 2 === 0 ? 'bg-gray-900/30' : ''}>
                    <td className="text-gray-300 py-2 px-2 sticky left-0 bg-black font-medium">
                      {formatDate(day.date)}
                    </td>
                    {SECTOR_ORDER.map(sector => {
                      const sectorData = day.sectors[sector] || { nh: 0, nl: 0 };
                      return (
                        <td key={sector} className="text-center py-2 px-1">
                          <div className="flex justify-center gap-1">
                            <span className={`${sectorData.nh > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                              {sectorData.nh}
                            </span>
                            <span className="text-gray-600">/</span>
                            <span className={`${sectorData.nl > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                              {sectorData.nl}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Format: <span className="text-green-400">NH</span> / <span className="text-red-400">NL</span> (New 15-Day Highs / New 15-Day Lows)
          </div>
        </div>
      )}

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
          <div className="text-white font-bold text-lg">{tooltip.stock.symbol}</div>
          <div className={tooltip.stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
            {tooltip.stock.changePercent >= 0 ? '+' : ''}{tooltip.stock.changePercent.toFixed(2)}%
          </div>
          <div className="text-gray-400 text-sm">
            ${tooltip.stock.price.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
