import { useState } from 'react';
import type { StockAnalysis } from '../types';
import { SearchBox } from './SearchBox';
import { StockHeader } from './analysis/StockHeader';
import { CompanyInfo } from './analysis/CompanyInfo';
import { KeyRatios } from './analysis/KeyRatios';
import { FinancialTable } from './analysis/FinancialTable';
import { DividendHistory } from './analysis/DividendHistory';

const API_BASE = '/api';

export function StockAnalysisView() {
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedSymbol, setSearchedSymbol] = useState<string>('');

  const handleSearch = async (symbol: string) => {
    setLoading(true);
    setError(null);
    setSearchedSymbol(symbol);

    try {
      const response = await fetch(`${API_BASE}/analysis?symbol=${symbol}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch data for ${symbol}`);
      }

      const data: StockAnalysis = await response.json();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    setAnalysis(null);
    setError(null);
    setSearchedSymbol('');
  };

  return (
    <div className="min-h-[80vh]">
      {/* Show search box if no analysis loaded */}
      {!analysis && !loading && (
        <SearchBox onSearch={handleSearch} loading={loading} />
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-4 text-gray-400">Loading analysis for {searchedSymbol}...</p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-6 max-w-md text-center">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-lg font-medium text-red-400 mb-2">Error</h3>
            <p className="text-red-300 mb-4">{error}</p>
            <button
              onClick={handleNewSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Another Search
            </button>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !loading && (
        <div className="space-y-4">
          {/* Back to Search Button */}
          <button
            onClick={handleNewSearch}
            className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Search Another Stock
          </button>

          {/* Stock Header */}
          <StockHeader analysis={analysis} />

          {/* Two Column Layout for Company Info and Key Ratios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CompanyInfo analysis={analysis} />
            <KeyRatios analysis={analysis} />
          </div>

          {/* Financial Tables */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <FinancialTable
              title="Income Statement"
              statements={analysis.incomeStatements}
              type="income"
            />
            <FinancialTable
              title="Balance Sheet"
              statements={analysis.balanceSheets}
              type="balance"
            />
            <FinancialTable
              title="Cash Flow"
              statements={analysis.cashFlows}
              type="cashflow"
            />
          </div>

          {/* Dividends */}
          {analysis.dividends && analysis.dividends.length > 0 && (
            <DividendHistory
              dividends={analysis.dividends}
              dividendYield={analysis.dividendYield}
            />
          )}
        </div>
      )}
    </div>
  );
}
