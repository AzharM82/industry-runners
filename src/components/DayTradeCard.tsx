import type { DayTradeGroup, DayTradeStock } from '../types';

interface DayTradeCardProps {
  group: DayTradeGroup;
  onStockClick: (symbol: string) => void;
}

export function DayTradeCard({ group, onStockClick }: DayTradeCardProps) {
  const avgChangeColor = group.avgChangePercent >= 0 ? 'text-green-400' : 'text-red-400';
  const avgChangeBg = group.avgChangePercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20';
  const sign = group.avgChangePercent >= 0 ? '+' : '';

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Group Header */}
      <div className="px-2 py-2 bg-yellow-900/30 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-yellow-400 text-sm truncate">{group.name}</span>
        </div>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${avgChangeBg} ${avgChangeColor}`}>
          {sign}{group.avgChangePercent.toFixed(2)}%
        </span>
      </div>

      {/* Stock Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-700">
              <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
              <th className="text-right px-2 py-1.5 font-medium">Last</th>
              <th className="text-right px-2 py-1.5 font-medium">%Chg</th>
              <th className="text-right px-2 py-1.5 font-medium">%Open</th>
              <th className="text-right px-2 py-1.5 font-medium">Vol</th>
              <th className="text-right px-2 py-1.5 font-medium">ATR</th>
            </tr>
          </thead>
          <tbody>
            {group.stocks.map((stock, idx) => (
              <DayTradeRow
                key={stock.symbol}
                stock={stock}
                rank={idx + 1}
                onClick={() => onStockClick(stock.symbol)}
              />
            ))}
            {group.stocks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-gray-500">
                  No matching stocks
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DayTradeRowProps {
  stock: DayTradeStock;
  rank: number;
  onClick: () => void;
}

function DayTradeRow({ stock, rank, onClick }: DayTradeRowProps) {
  const formatPrice = (price: number) => {
    if (price >= 100) return price.toFixed(1);
    return price.toFixed(2);
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

  const getBgClass = (value: number | undefined) => {
    if (value === undefined || value === null) return '';
    if (value > 0) return 'bg-green-500/10';
    if (value < 0) return 'bg-red-500/10';
    return '';
  };

  // ATR color - higher ATR is more yellow/orange (more volatile = better for day trading)
  const getAtrColorClass = (atrPercent: number) => {
    if (atrPercent >= 8) return 'text-orange-400';
    if (atrPercent >= 5) return 'text-yellow-400';
    return 'text-gray-300';
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toString();
  };

  return (
    <tr
      className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 w-3">{rank}</span>
          <span className="font-medium text-white text-xs">{stock.symbol}</span>
        </div>
      </td>
      <td className="text-right px-2 py-1.5 font-mono text-xs text-gray-200">
        ${formatPrice(stock.last)}
      </td>
      <td className={`text-right px-2 py-1.5 font-mono text-xs ${getColorClass(stock.changePercent)}`}>
        {formatPercent(stock.changePercent)}
      </td>
      <td className={`text-right px-2 py-1.5 font-mono text-xs ${getColorClass(stock.changeFromOpenPercent)}`}>
        <span className={`px-1 py-0.5 rounded ${getBgClass(stock.changeFromOpenPercent)}`}>
          {formatPercent(stock.changeFromOpenPercent)}
        </span>
      </td>
      <td className="text-right px-2 py-1.5 font-mono text-xs text-gray-400">
        {formatVolume(stock.volume)}
      </td>
      <td className={`text-right px-2 py-1.5 font-mono text-xs ${getAtrColorClass(stock.atrPercent)}`}>
        {stock.atr > 0 ? `$${stock.atr.toFixed(2)}` : '-'}
      </td>
    </tr>
  );
}
