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
  const [activeNHNLChart, setActiveNHNLChart] = useState<'heatmap' | 'timeline'>('heatmap');
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

  // Calculate net score (NH - NL) per sector per day for charts
  const sectorNetScores = useMemo(() => {
    // Build data structure: { sectorName: [{ date, net, nh, nl }] }
    const scores: Record<string, { date: string; net: number; nh: number; nl: number }[]> = {};

    SECTOR_ORDER.forEach(sector => {
      scores[sector] = [];
    });

    // Process days in reverse order (oldest first) for the timeline
    const reversedDays = [...filteredHistoryDays].reverse();

    reversedDays.forEach(day => {
      SECTOR_ORDER.forEach(sector => {
        const data = day.sectors[sector] || { nh: 0, nl: 0 };
        scores[sector].push({
          date: day.date,
          net: data.nh - data.nl,
          nh: data.nh,
          nl: data.nl
        });
      });
    });

    return scores;
  }, [filteredHistoryDays]);

  // Calculate cumulative net score per sector for sorting legend
  const sectorCumulativeScores = useMemo(() => {
    return SECTOR_ORDER.map(sector => {
      const total = sectorNetScores[sector]?.reduce((sum, d) => sum + d.net, 0) || 0;
      return { sector, total };
    }).sort((a, b) => b.total - a.total);
  }, [sectorNetScores]);

  // Sector colors for the line chart
  const sectorColors: Record<string, string> = {
    'Tech': '#22d3ee',        // cyan
    'Financials': '#f87171',   // red
    'Health Care': '#4ade80',  // green
    'Discretionary': '#a78bfa', // purple
    'Comm Services': '#2dd4bf', // teal
    'Industrials': '#34d399',   // emerald
    'Staples': '#fb923c',       // orange
    'Energy': '#f472b6',        // pink
    'Utilities': '#c084fc',     // violet
    'Materials': '#60a5fa',     // blue
    'Real Estate': '#fbbf24'    // amber
  };

  // Get heatmap cell color based on net score
  const getHeatmapColor = (net: number) => {
    if (net >= 6) return 'bg-green-600'; // Strong Highs
    if (net >= 1) return 'bg-green-700/70'; // Moderate Highs
    if (net === 0) return 'bg-gray-700'; // Neutral
    if (net >= -5) return 'bg-red-700/70'; // Moderate Lows
    return 'bg-red-600'; // Strong Lows
  };

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

      {/* NH/NL Charts Section */}
      {filteredHistoryDays.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-white mb-1">New Highs / New Lows by Sector</h3>
          <p className="text-sm text-gray-500 mb-4">Last {filteredHistoryDays.length} Business Days • Format: NH / NL (15-Day Period)</p>

          {/* Chart Toggle Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveNHNLChart('heatmap')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeNHNLChart === 'heatmap'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Heatmap
            </button>
            <button
              onClick={() => setActiveNHNLChart('timeline')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeNHNLChart === 'timeline'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Net Score Timeline
            </button>
          </div>

          {/* Heatmap View */}
          {activeNHNLChart === 'heatmap' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-gray-400 py-3 px-3 sticky left-0 bg-black">Date</th>
                    {SECTOR_ORDER.map(sector => (
                      <th key={sector} className="text-center text-gray-400 py-3 px-2 min-w-[85px]">
                        <div className="text-xs">{sector}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryDays.map((day) => (
                    <tr key={day.date}>
                      <td className="text-gray-300 py-2 px-3 sticky left-0 bg-black font-medium">
                        {formatDate(day.date)}
                      </td>
                      {SECTOR_ORDER.map(sector => {
                        const sectorData = day.sectors[sector] || { nh: 0, nl: 0 };
                        const net = sectorData.nh - sectorData.nl;
                        return (
                          <td key={sector} className="p-1">
                            <div className={`${getHeatmapColor(net)} rounded-lg py-3 px-2 text-center`}>
                              <div className="text-white font-bold text-base">
                                {net > 0 ? '+' : ''}{net}
                              </div>
                              <div className="text-white/70 text-xs">
                                {sectorData.nh}/{sectorData.nl}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Legend */}
              <div className="flex justify-center gap-4 mt-4 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-600 rounded"></div>
                  <span className="text-gray-400">Strong Highs</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-700/70 rounded"></div>
                  <span className="text-gray-400">Moderate Highs</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-700 rounded"></div>
                  <span className="text-gray-400">Neutral</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-700/70 rounded"></div>
                  <span className="text-gray-400">Moderate Lows</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-600 rounded"></div>
                  <span className="text-gray-400">Strong Lows</span>
                </div>
              </div>
            </div>
          )}

          {/* Net Score Timeline View */}
          {activeNHNLChart === 'timeline' && (
            <div className="bg-gray-900/50 rounded-lg p-4">
              <svg width="100%" height="320" viewBox="0 0 900 320" preserveAspectRatio="xMidYMid meet">
                {(() => {
                  const padding = { left: 50, right: 30, top: 20, bottom: 50 };
                  const chartWidth = 900 - padding.left - padding.right;
                  const chartHeight = 250 - padding.top - padding.bottom;

                  // Get all net values to find min/max
                  const allNets = Object.values(sectorNetScores).flatMap(arr => arr.map(d => d.net));
                  const maxNet = Math.max(...allNets, 1);
                  const minNet = Math.min(...allNets, -1);
                  const range = Math.max(Math.abs(maxNet), Math.abs(minNet));

                  const days = sectorNetScores[SECTOR_ORDER[0]]?.map(d => d.date) || [];
                  const xStep = days.length > 1 ? chartWidth / (days.length - 1) : chartWidth;

                  const getX = (i: number) => padding.left + i * xStep;
                  const getY = (val: number) => padding.top + chartHeight / 2 - (val / range) * (chartHeight / 2);

                  return (
                    <>
                      {/* Y-axis grid lines and labels */}
                      {[-range, -range / 2, 0, range / 2, range].map((val) => {
                        const y = getY(val);
                        return (
                          <g key={`y-${val}`}>
                            <line
                              x1={padding.left}
                              y1={y}
                              x2={padding.left + chartWidth}
                              y2={y}
                              stroke={val === 0 ? '#555' : '#333'}
                              strokeDasharray={val === 0 ? '0' : '2,2'}
                            />
                            <text x={padding.left - 8} y={y + 4} fill="#666" fontSize={11} textAnchor="end">
                              {Math.round(val)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Y-axis label */}
                      <text
                        x={15}
                        y={padding.top + chartHeight / 2}
                        fill="#666"
                        fontSize={10}
                        textAnchor="middle"
                        transform={`rotate(-90, 15, ${padding.top + chartHeight / 2})`}
                      >
                        Net (Highs - Lows)
                      </text>

                      {/* X-axis date labels */}
                      {days.map((date, i) => (
                        <g key={date}>
                          <line
                            x1={getX(i)}
                            y1={padding.top}
                            x2={getX(i)}
                            y2={padding.top + chartHeight}
                            stroke="#333"
                            strokeDasharray="2,2"
                          />
                          <text
                            x={getX(i)}
                            y={padding.top + chartHeight + 20}
                            fill="#888"
                            fontSize={11}
                            textAnchor="middle"
                          >
                            {formatDate(date)}
                          </text>
                        </g>
                      ))}

                      {/* Lines for each sector */}
                      {SECTOR_ORDER.map(sector => {
                        const data = sectorNetScores[sector] || [];
                        if (data.length === 0) return null;

                        const pathD = data.map((d, i) => {
                          const x = getX(i);
                          const y = getY(d.net);
                          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                        }).join(' ');

                        return (
                          <g key={sector}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={sectorColors[sector]}
                              strokeWidth={2}
                            />
                            {/* Data points */}
                            {data.map((d, i) => (
                              <circle
                                key={`${sector}-${i}`}
                                cx={getX(i)}
                                cy={getY(d.net)}
                                r={4}
                                fill={sectorColors[sector]}
                                stroke="#000"
                                strokeWidth={1}
                              />
                            ))}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>

              {/* Legend sorted by cumulative score */}
              <div className="flex justify-center gap-3 mt-4 flex-wrap">
                {sectorCumulativeScores.map(({ sector, total }) => (
                  <div key={sector} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-3 h-3 rounded border border-gray-600"
                      style={{ backgroundColor: sectorColors[sector] }}
                    ></div>
                    <span className="text-gray-400">
                      {sector} ({total > 0 ? '+' : ''}{total})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
