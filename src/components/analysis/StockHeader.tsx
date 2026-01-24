import type { StockAnalysis } from '../../types';

interface StockHeaderProps {
  analysis: StockAnalysis;
}

function formatNumber(num: number | null | undefined, decimals: number = 2): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || num === 0) return 'N/A';

  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatVolume(num: number | null | undefined): string {
  if (num === null || num === undefined || num === 0) return 'N/A';

  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return num.toLocaleString();
}

export function StockHeader({ analysis }: StockHeaderProps) {
  const isPositive = analysis.change >= 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      {/* Top Row: Symbol, Name, Price, Change */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{analysis.symbol}</h1>
            <span className="text-sm px-2 py-1 bg-gray-700 text-gray-300 rounded">
              {analysis.exchange}
            </span>
          </div>
          <p className="text-lg text-gray-400 mt-1">{analysis.name}</p>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-white">
            ${formatNumber(analysis.last)}
          </div>
          <div className={`text-xl font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{formatNumber(analysis.change)} ({isPositive ? '+' : ''}{formatNumber(analysis.changePercent)}%)
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard label="Market Cap" value={formatLargeNumber(analysis.marketCap)} />
        <MetricCard label="Volume" value={formatVolume(analysis.volume)} />
        <MetricCard label="Avg Volume" value={formatVolume(analysis.avgVolume)} />
        <MetricCard label="Open" value={`$${formatNumber(analysis.open)}`} />
        <MetricCard label="Day High" value={`$${formatNumber(analysis.high)}`} />
        <MetricCard label="Day Low" value={`$${formatNumber(analysis.low)}`} />
        <MetricCard
          label="52W High"
          value={`$${formatNumber(analysis.week52High)}`}
          highlight={analysis.last >= analysis.week52High * 0.95}
        />
        <MetricCard
          label="52W Low"
          value={`$${formatNumber(analysis.week52Low)}`}
          highlightNegative={analysis.last <= analysis.week52Low * 1.05}
        />
        <MetricCard
          label="P/E Ratio"
          value={analysis.peRatio !== null ? formatNumber(analysis.peRatio) : 'N/A'}
        />
        <MetricCard
          label="P/B Ratio"
          value={analysis.pbRatio !== null ? formatNumber(analysis.pbRatio) : 'N/A'}
        />
        <MetricCard
          label="Dividend Yield"
          value={analysis.dividendYield !== null ? `${formatNumber(analysis.dividendYield)}%` : 'N/A'}
        />
        <MetricCard label="Employees" value={analysis.employees ? analysis.employees.toLocaleString() : 'N/A'} />
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  highlightNegative?: boolean;
}

function MetricCard({ label, value, highlight = false, highlightNegative = false }: MetricCardProps) {
  let bgClass = 'bg-gray-700/50';
  let textClass = 'text-white';

  if (highlight) {
    bgClass = 'bg-green-500/20';
    textClass = 'text-green-400';
  } else if (highlightNegative) {
    bgClass = 'bg-red-500/20';
    textClass = 'text-red-400';
  }

  return (
    <div className={`p-3 rounded-lg ${bgClass}`}>
      <div className="text-xs text-gray-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${textClass}`}>
        {value}
      </div>
    </div>
  );
}
