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
    <div className="bg-[#FFFDF8] border border-[#D4C9B5] rounded-lg p-6 shadow-sm">
      {/* Top Row: Symbol, Name, Price, Change */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-[#3D3D3D]">{analysis.symbol}</h1>
            <span className="text-sm px-2 py-1 bg-[#F5F0E6] text-[#6B6B6B] rounded">
              {analysis.exchange}
            </span>
          </div>
          <p className="text-lg text-[#6B6B6B] mt-1">{analysis.name}</p>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-[#3D3D3D]">
            ${formatNumber(analysis.last)}
          </div>
          <div className={`text-xl font-medium ${isPositive ? 'text-[#5A8B5A]' : 'text-[#C45C4A]'}`}>
            {isPositive ? '+' : ''}{formatNumber(analysis.change)} ({isPositive ? '+' : ''}{formatNumber(analysis.changePercent)}%)
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
          highlight={analysis.last <= analysis.week52Low * 1.05}
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
}

function MetricCard({ label, value, highlight = false }: MetricCardProps) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-[#E07B54]/10 border border-[#E07B54]/30' : 'bg-[#F5F0E6]'}`}>
      <div className="text-xs text-[#6B6B6B] uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${highlight ? 'text-[#E07B54]' : 'text-[#3D3D3D]'}`}>
        {value}
      </div>
    </div>
  );
}
