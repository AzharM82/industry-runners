import type { StockAnalysis } from '../../types';

interface KeyRatiosProps {
  analysis: StockAnalysis;
}

function formatRatio(value: number | null, suffix: string = ''): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(2)}${suffix}`;
}

export function KeyRatios({ analysis }: KeyRatiosProps) {
  const ratios = [
    {
      label: 'P/E Ratio',
      value: analysis.peRatio,
      description: 'Price to Earnings',
      suffix: 'x',
    },
    {
      label: 'P/B Ratio',
      value: analysis.pbRatio,
      description: 'Price to Book',
      suffix: 'x',
    },
    {
      label: 'P/S Ratio',
      value: analysis.psRatio,
      description: 'Price to Sales',
      suffix: 'x',
    },
    {
      label: 'ROE',
      value: analysis.roe,
      description: 'Return on Equity',
      suffix: '%',
    },
    {
      label: 'ROA',
      value: analysis.roa,
      description: 'Return on Assets',
      suffix: '%',
    },
    {
      label: 'D/E Ratio',
      value: analysis.debtToEquity,
      description: 'Debt to Equity',
      suffix: 'x',
    },
  ];

  const hasAnyRatio = ratios.some((r) => r.value !== null);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">
        Key Ratios
      </h2>

      {!hasAnyRatio ? (
        <p className="text-gray-400 text-sm">
          Financial ratios are not available for this stock. This may be due to limited financial data.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {ratios.map((ratio) => (
            <RatioCard
              key={ratio.label}
              label={ratio.label}
              value={ratio.value}
              description={ratio.description}
              suffix={ratio.suffix}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RatioCardProps {
  label: string;
  value: number | null;
  description: string;
  suffix: string;
}

function RatioCard({ label, value, description, suffix }: RatioCardProps) {
  const isGood = (label: string, val: number | null): boolean | null => {
    if (val === null) return null;

    switch (label) {
      case 'ROE':
      case 'ROA':
        return val > 10;
      case 'D/E Ratio':
        return val < 1;
      case 'P/E Ratio':
        return val > 0 && val < 25;
      default:
        return null;
    }
  };

  const goodIndicator = isGood(label, value);

  return (
    <div className="p-3 bg-gray-700/50 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
        {goodIndicator !== null && (
          <span
            className={`w-2 h-2 rounded-full ${
              goodIndicator ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
        )}
      </div>
      <div className="text-xl font-semibold text-white">
        {formatRatio(value, suffix)}
      </div>
      <div className="text-xs text-gray-500 mt-1">{description}</div>
    </div>
  );
}
