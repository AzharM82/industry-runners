import type { MarketIndex } from '../types';

interface MarketIndicesProps {
  indices: MarketIndex[];
}

export function MarketIndices({ indices }: MarketIndicesProps) {
  const formatPrice = (price: number) => {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercent = (pct: number | undefined) => {
    if (pct === undefined || pct === null) return '-';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  const getColorClass = (value: number | undefined) => {
    if (value === undefined || value === null) return 'text-gray-400';
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-gray-400';
  };

  if (indices.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800/50 border-b border-gray-700">
      <div className="max-w-[1800px] mx-auto px-4 py-2">
        <div className="flex items-center justify-between gap-4 overflow-x-auto">
          {indices.map(index => (
            <div key={index.symbol} className="flex items-center gap-3 min-w-fit">
              <div className="text-sm">
                <span className="font-medium text-gray-300">{index.name}</span>
              </div>
              <div className="text-sm font-mono text-white">
                {formatPrice(index.last)}
              </div>
              <div className={`text-sm font-mono ${getColorClass(index.changePercent)}`}>
                {formatPercent(index.changePercent)}
              </div>
              <div className={`text-xs font-mono ${getColorClass(index.change5Day)}`}>
                <span className="text-gray-500">5D:</span> {formatPercent(index.change5Day)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
