import type { ETFWithData, StockQuote } from '../types';

interface ETFCardProps {
  etf: ETFWithData;
  onStockClick: (symbol: string) => void;
}

export function ETFCard({ etf, onStockClick }: ETFCardProps) {
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(0);
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

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* ETF Header */}
      <div className="px-2 py-2 bg-gray-750 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-white text-sm">{etf.symbol}</span>
          <span className="text-xs text-gray-400 truncate">{etf.name}</span>
        </div>
        {etf.etfQuote && (
          <div className="flex items-center gap-2 text-right">
            <span className="font-medium text-white text-sm">${formatPrice(etf.etfQuote.last)}</span>
            <span className={`text-xs ${getColorClass(etf.etfQuote.changePercent)}`}>
              {formatPercent(etf.etfQuote.changePercent)}
            </span>
          </div>
        )}
      </div>

      {/* Stock Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-700">
              <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
              <th className="text-right px-2 py-1.5 font-medium">Last</th>
              <th className="text-right px-2 py-1.5 font-medium">%Open</th>
              <th className="text-right px-2 py-1.5 font-medium">Vol</th>
            </tr>
          </thead>
          <tbody>
            {etf.stocks.map((stock, idx) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                rank={idx + 1}
                onClick={() => onStockClick(stock.symbol)}
              />
            ))}
            {etf.stocks.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface StockRowProps {
  stock: StockQuote;
  rank: number;
  onClick: () => void;
}

function StockRow({ stock, rank, onClick }: StockRowProps) {
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 100) return price.toFixed(1);
    return price.toFixed(2);
  };

  const formatPercent = (pct: number | undefined) => {
    if (pct === undefined || pct === null) return '-';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };

  const formatVolume = (vol: number | undefined) => {
    if (vol === undefined || vol === null || vol === 0) return '-';
    if (vol >= 1000000000) return (vol / 1000000000).toFixed(1) + 'B';
    if (vol >= 1000000) return (vol / 1000000).toFixed(1) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(0) + 'K';
    return vol.toString();
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
      <td className={`text-right px-2 py-1.5 font-mono text-xs ${getColorClass(stock.changeFromOpenPercent)}`}>
        <span className={`px-1 py-0.5 rounded ${getBgClass(stock.changeFromOpenPercent)}`}>
          {formatPercent(stock.changeFromOpenPercent)}
        </span>
      </td>
      <td className="text-right px-2 py-1.5 font-mono text-xs text-gray-400">
        {formatVolume(stock.volume)}
      </td>
    </tr>
  );
}
