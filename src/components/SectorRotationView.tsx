import { useState, useEffect, useCallback, useMemo } from 'react';

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
}

interface SectorData {
  timestamp: number;
  sectors: Sector[];
  cached?: boolean;
}

interface TooltipData {
  stock: Stock;
  x: number;
  y: number;
}

export function SectorRotationView() {
  const [data, setData] = useState<SectorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

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

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Chart configuration
  const chartConfig = useMemo(() => {
    return {
      width: 1400,
      height: 600,
      padding: { top: 30, right: 50, bottom: 60, left: 50 },
      minChange: -15,
      maxChange: 15
    };
  }, []);

  // Map Y value (% change) to pixel position
  const getY = useCallback((changePercent: number) => {
    const { height, padding, maxChange, minChange } = chartConfig;
    const chartHeight = height - padding.top - padding.bottom;
    const clampedChange = Math.max(minChange, Math.min(maxChange, changePercent));
    return padding.top + ((maxChange - clampedChange) / (maxChange - minChange)) * chartHeight;
  }, [chartConfig]);

  // Get X position for a stock within a sector
  const getStockX = useCallback((sectorIndex: number, stockIndex: number, totalStocks: number) => {
    const { width, padding } = chartConfig;
    const sectorCount = 11;
    const chartWidth = width - padding.left - padding.right;
    const sectorWidth = chartWidth / sectorCount;
    const sectorCenter = padding.left + sectorIndex * sectorWidth + sectorWidth / 2;

    // Spread stocks horizontally within the sector column
    const spread = sectorWidth * 0.8;
    const offset = totalStocks > 1
      ? ((stockIndex / (totalStocks - 1)) - 0.5) * spread
      : 0;

    return sectorCenter + offset;
  }, [chartConfig]);

  // Get bubble radius (fixed size for now, can be based on volume/market cap later)
  const getRadius = useCallback((stock: Stock) => {
    // Larger radius for bigger moves
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

  const { sectors } = data;
  const sectorWidth = (chartConfig.width - chartConfig.padding.left - chartConfig.padding.right) / sectors.length;

  return (
    <div className="bg-black rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Sector Rotation</h2>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 text-white text-sm rounded transition-colors"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Bubble Chart */}
      <div className="overflow-x-auto">
        <svg
          width={chartConfig.width}
          height={chartConfig.height}
          style={{ minWidth: chartConfig.width, background: '#0a0a0a' }}
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
                  y={y + 4}
                  fill="#666"
                  fontSize={11}
                  textAnchor="end"
                >
                  {value > 0 ? '+' : ''}{value}%
                </text>
                {/* Right label */}
                <text
                  x={chartConfig.width - chartConfig.padding.right + 8}
                  y={y + 4}
                  fill="#666"
                  fontSize={11}
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
                const x = getStockX(sectorIndex, stockIndex, sector.stocks.length);
                const y = getY(stock.changePercent);
                const r = getRadius(stock);
                const isPositive = stock.changePercent >= 0;

                return (
                  <g key={stock.symbol}>
                    {/* Bubble */}
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      fill={isPositive ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'}
                      stroke={isPositive ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)'}
                      strokeWidth={1}
                      className="cursor-pointer transition-opacity hover:opacity-80"
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
                  x={x - 28}
                  y={y + 8}
                  width={56}
                  height={22}
                  rx={3}
                  fill={isPositive ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'}
                />
                <text
                  x={x}
                  y={y + 23}
                  fill="white"
                  fontSize={11}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isPositive ? '+' : ''}{sector.avgChange.toFixed(1)}%
                </text>

                {/* Sector name */}
                <text
                  x={x}
                  y={y + 48}
                  fill="#888"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {sector.shortName}
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
