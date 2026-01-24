import type { IncomeStatement, BalanceSheet, CashFlowStatement } from '../../types';

type StatementType = 'income' | 'balance' | 'cashflow';
type Statement = IncomeStatement | BalanceSheet | CashFlowStatement;

interface FinancialTableProps {
  title: string;
  statements: Statement[];
  type: StatementType;
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return 'N/A';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) return `${sign}$${(absValue / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `${sign}$${(absValue / 1e6).toFixed(1)}M`;
  if (absValue >= 1e3) return `${sign}$${(absValue / 1e3).toFixed(0)}K`;
  return `${sign}$${absValue.toFixed(0)}`;
}

function getIncomeFields(): { key: keyof IncomeStatement; label: string }[] {
  return [
    { key: 'revenue', label: 'Revenue' },
    { key: 'grossProfit', label: 'Gross Profit' },
    { key: 'operatingIncome', label: 'Operating Income' },
    { key: 'netIncome', label: 'Net Income' },
    { key: 'eps', label: 'EPS' },
    { key: 'ebitda', label: 'EBITDA' },
  ];
}

function getBalanceFields(): { key: keyof BalanceSheet; label: string }[] {
  return [
    { key: 'cash', label: 'Cash' },
    { key: 'currentAssets', label: 'Current Assets' },
    { key: 'totalAssets', label: 'Total Assets' },
    { key: 'currentLiabilities', label: 'Current Liabilities' },
    { key: 'totalLiabilities', label: 'Total Liabilities' },
    { key: 'totalEquity', label: 'Total Equity' },
  ];
}

function getCashFlowFields(): { key: keyof CashFlowStatement; label: string }[] {
  return [
    { key: 'operatingCashFlow', label: 'Operating CF' },
    { key: 'investingCashFlow', label: 'Investing CF' },
    { key: 'financingCashFlow', label: 'Financing CF' },
    { key: 'freeCashFlow', label: 'Free Cash Flow' },
  ];
}

export function FinancialTable({ title, statements, type }: FinancialTableProps) {
  if (!statements || statements.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <p className="text-gray-400 text-sm">
          {title} data is not available. This may require a premium Polygon subscription.
        </p>
      </div>
    );
  }

  const getFields = () => {
    switch (type) {
      case 'income':
        return getIncomeFields();
      case 'balance':
        return getBalanceFields();
      case 'cashflow':
        return getCashFlowFields();
    }
  };

  const fields = getFields();
  const displayStatements = statements.slice(0, 4);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 overflow-hidden">
      <h2 className="text-xl font-bold text-white mb-4">{title}</h2>

      <div className="overflow-x-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 pr-4 text-gray-400 font-medium">Metric</th>
              {displayStatements.map((stmt, idx) => (
                <th key={idx} className="text-right py-2 px-2 text-gray-400 font-medium whitespace-nowrap">
                  {stmt.period} {stmt.fiscalYear}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.key} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="py-2 pr-4 text-gray-300 font-medium">{field.label}</td>
                {displayStatements.map((stmt, idx) => {
                  const value = (stmt as unknown as Record<string, number | string | undefined>)[field.key as string] as number | undefined;
                  const prevValue = idx < displayStatements.length - 1
                    ? (displayStatements[idx + 1] as unknown as Record<string, number | string | undefined>)[field.key as string] as number | undefined
                    : undefined;

                  const trend = prevValue !== undefined && value !== undefined && prevValue !== 0
                    ? ((value - prevValue) / Math.abs(prevValue)) * 100
                    : null;

                  return (
                    <td key={idx} className="text-right py-2 px-2 text-gray-200">
                      <div className="flex items-center justify-end gap-1">
                        <span>
                          {field.key === 'eps' && value !== undefined
                            ? `$${value.toFixed(2)}`
                            : formatCurrency(value)}
                        </span>
                        {trend !== null && (
                          <span
                            className={`text-xs ${
                              trend > 0 ? 'text-green-500' : trend < 0 ? 'text-red-500' : 'text-gray-500'
                            }`}
                          >
                            {trend > 0 ? '\u25B2' : trend < 0 ? '\u25BC' : ''}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Quarterly data. Trend arrows compare to previous quarter.
      </p>
    </div>
  );
}
