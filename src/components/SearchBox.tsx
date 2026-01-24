import { useState } from 'react';
import type { KeyboardEvent } from 'react';

interface SearchBoxProps {
  onSearch: (symbol: string) => void;
  loading: boolean;
}

export function SearchBox({ onSearch, loading }: SearchBoxProps) {
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    const symbol = query.trim().toUpperCase();
    if (symbol) {
      onSearch(symbol);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h2 className="text-2xl font-bold text-white mb-6">
        Search for a Stock
      </h2>
      <div className="flex items-center w-full max-w-xl">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
            disabled={loading}
            className="w-full px-5 py-4 text-lg border-2 border-gray-700 rounded-l-lg
                       bg-gray-800 text-white placeholder-gray-500
                       focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                       disabled:bg-gray-900 disabled:cursor-not-allowed"
          />
          <svg
            className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-8 py-4 text-lg font-medium text-white bg-blue-600
                     rounded-r-lg hover:bg-blue-700 transition-colors
                     disabled:bg-gray-700 disabled:cursor-not-allowed
                     border-2 border-blue-600 disabled:border-gray-700"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>
      <p className="mt-4 text-sm text-gray-500">
        Enter a stock symbol to view comprehensive analysis including financials, ratios, and dividends.
      </p>
    </div>
  );
}
