import type { StockQuote } from '../types';

interface StockModalProps {
  stock: StockQuote | null;
  symbol: string;
  onClose: () => void;
}

export function StockModal({ stock, symbol, onClose }: StockModalProps) {
  const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return '-';
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 100) return `$${price.toFixed(1)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatPercent = (pct: number | undefined) => {
    if (pct === undefined || pct === null) return '-';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  const formatVolume = (vol: number | undefined) => {
    if (!vol) return '-';
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toLocaleString();
  };

  const formatMarketCap = (cap: number | undefined | null) => {
    if (!cap) return '-';
    if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap.toLocaleString()}`;
  };

  const getColorClass = (value: number | undefined) => {
    if (value === undefined) return 'text-gray-400';
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-gray-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white">{symbol}</h2>
            {stock?.name && (
              <p className="text-sm text-gray-400">{stock.name}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {stock ? (
          <div className="p-6">
            {/* Price Section */}
            <div className="text-center mb-6">
              <div className="text-4xl font-bold text-white mb-2">
                {formatPrice(stock.last)}
              </div>
              <div className="flex items-center justify-center gap-4">
                <span className={`text-lg ${getColorClass(stock.change)}`}>
                  {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2) || '-'}
                </span>
                <span className={`text-lg font-medium ${getColorClass(stock.changePercent)}`}>
                  {formatPercent(stock.changePercent)}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <StatItem label="Open" value={formatPrice(stock.open)} />
              <StatItem label="Prev Close" value={formatPrice(stock.previousClose)} />
              <StatItem label="High" value={formatPrice(stock.high)} />
              <StatItem label="Low" value={formatPrice(stock.low)} />
              <StatItem
                label="% from Open"
                value={formatPercent(stock.changeFromOpenPercent)}
                valueClass={getColorClass(stock.changeFromOpenPercent)}
              />
              <StatItem label="Market Cap" value={formatMarketCap(stock.marketCap)} />
              <StatItem label="52W High" value={formatPrice(stock.week52High)} />
              <StatItem label="52W Low" value={formatPrice(stock.week52Low)} />
              <StatItem label="Volume" value={formatVolume(stock.volume)} />
              <StatItem label="Avg Volume" value={formatVolume(stock.avgVolume)} />
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-400">
            Loading stock details...
          </div>
        )}
      </div>
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  valueClass?: string;
}

function StatItem({ label, value, valueClass = 'text-white' }: StatItemProps) {
  return (
    <div className="bg-gray-700/50 rounded-lg p-3">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}
