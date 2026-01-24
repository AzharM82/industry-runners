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
    <div className="bg-[#FFFDF8] border border-[#D4C9B5] rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-serif font-bold text-[#3D3D3D]">Dividend History</h2>
        {dividendYield !== null && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-[#6B6B6B] uppercase">Annual Dividend</div>
              <div className="text-lg font-semibold text-[#3D3D3D]">
                ${annualDividend.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#6B6B6B] uppercase">Yield</div>
              <div className="text-lg font-semibold text-[#5A8B5A]">
                {dividendYield.toFixed(2)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#6B6B6B] uppercase">Frequency</div>
              <div className="text-lg font-semibold text-[#3D3D3D]">
                {getFrequencyLabel(frequency)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#D4C9B5]">
              <th className="text-left py-2 pr-4 text-[#6B6B6B] font-medium">Ex-Dividend Date</th>
              <th className="text-left py-2 px-4 text-[#6B6B6B] font-medium">Pay Date</th>
              <th className="text-right py-2 pl-4 text-[#6B6B6B] font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recentDividends.map((div, idx) => (
              <tr
                key={idx}
                className="border-b border-[#F5F0E6] hover:bg-[#F5F0E6]/50"
              >
                <td className="py-3 pr-4 text-[#3D3D3D]">{formatDate(div.exDate)}</td>
                <td className="py-3 px-4 text-[#6B6B6B]">{formatDate(div.payDate)}</td>
                <td className="py-3 pl-4 text-right font-medium text-[#5A8B5A]">
                  ${div.amount.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dividends.length > 8 && (
        <p className="text-xs text-[#6B6B6B] mt-4">
          Showing most recent 8 dividends of {dividends.length} total.
        </p>
      )}
    </div>
  );
}
