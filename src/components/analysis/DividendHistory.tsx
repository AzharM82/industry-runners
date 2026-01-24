import type { DividendInfo } from '../../types';

interface DividendHistoryProps {
  dividends: DividendInfo[];
  dividendYield: number | null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getFrequencyLabel(freq: number): string {
  switch (freq) {
    case 1:
      return 'Annual';
    case 2:
      return 'Semi-Annual';
    case 4:
      return 'Quarterly';
    case 12:
      return 'Monthly';
    default:
      return freq > 0 ? `${freq}x/year` : 'Unknown';
  }
}

export function DividendHistory({ dividends, dividendYield }: DividendHistoryProps) {
  const recentDividends = dividends.slice(0, 8);
  const frequency = dividends[0]?.frequency || 0;

  // Calculate annual dividend
  const annualDividend = dividends[0]
    ? dividends[0].amount * frequency
    : 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h2 className="text-xl font-bold text-white">Dividend History</h2>
        {dividendYield !== null && (
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase">Annual Dividend</div>
              <div className="text-lg font-semibold text-white">
                ${annualDividend.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase">Yield</div>
              <div className="text-lg font-semibold text-green-500">
                {dividendYield.toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase">Frequency</div>
              <div className="text-lg font-semibold text-white">
                {getFrequencyLabel(frequency)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 pr-4 text-gray-400 font-medium">Ex-Dividend Date</th>
              <th className="text-left py-2 px-4 text-gray-400 font-medium">Pay Date</th>
              <th className="text-right py-2 pl-4 text-gray-400 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recentDividends.map((div, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-700/50 hover:bg-gray-700/30"
              >
                <td className="py-3 pr-4 text-gray-200">{formatDate(div.exDate)}</td>
                <td className="py-3 px-4 text-gray-400">{formatDate(div.payDate)}</td>
                <td className="py-3 pl-4 text-right font-medium text-green-500">
                  ${div.amount.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dividends.length > 8 && (
        <p className="text-xs text-gray-500 mt-4">
          Showing most recent 8 dividends of {dividends.length} total.
        </p>
      )}
    </div>
  );
}
