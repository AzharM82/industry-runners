import { useState } from 'react';

interface Usage {
  used: number;
  limit: number;
}

interface PromptResult {
  result: string;
  cached: boolean;
  ticker: string;
  prompt_type: string;
  usage: Usage;
}

const PROMPT_TYPES = [
  {
    id: 'chartgpt',
    name: 'ChartGPT',
    description: 'AI pattern analysis with entry/exit points',
    icon: '📊'
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: '13-point institutional equity research',
    icon: '📑'
  },
  {
    id: 'halal',
    name: 'Halal Check',
    description: 'AAOIFI Shariah compliance screening',
    icon: '✅'
  }
];

export function PromptRunner() {
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!selectedPrompt || !ticker.trim()) {
      setError('Please select a prompt type and enter a ticker');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/run-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt_type: selectedPrompt,
          ticker: ticker.trim().toUpperCase()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'NO_SUBSCRIPTION') {
          setError('Active subscription required. Please subscribe to use this feature.');
        } else if (data.code === 'LIMIT_REACHED') {
          setError(`Monthly limit reached (${data.limit} prompts). Limit resets next month.`);
        } else {
          setError(data.error || 'Failed to run analysis');
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleRun();
    }
  };

  return (
    <div className="space-y-6">
      {/* Prompt Type Selection */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Select Analysis Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROMPT_TYPES.map((prompt) => (
            <button
              key={prompt.id}
              onClick={() => setSelectedPrompt(prompt.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedPrompt === prompt.id
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-2">{prompt.icon}</div>
              <div className="font-semibold text-white">{prompt.name}</div>
              <div className="text-sm text-gray-400 mt-1">{prompt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ticker Input */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Stock Ticker
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
            placeholder="e.g., AAPL, TSLA, NVDA"
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            disabled={loading}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={loading || !selectedPrompt || !ticker.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing...
              </span>
            ) : (
              'Run Analysis'
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-xl text-red-300">
          {error}
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Result Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50">
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {PROMPT_TYPES.find(p => p.id === result.prompt_type)?.icon}
              </span>
              <div>
                <span className="font-semibold text-white">{result.ticker}</span>
                <span className="text-gray-400 ml-2">
                  {PROMPT_TYPES.find(p => p.id === result.prompt_type)?.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {result.cached && (
                <span className="text-xs px-2 py-1 bg-green-900/50 text-green-400 rounded">
                  Cached
                </span>
              )}
              <span className="text-xs text-gray-500">
                {result.usage.used} / {result.usage.limit} used this month
              </span>
            </div>
          </div>

          {/* Result Content */}
          <div className="p-6 overflow-auto max-h-[600px]">
            <div className="prose prose-invert max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed">
                {result.result}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
