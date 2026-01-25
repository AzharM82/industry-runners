import { useState, useRef, useCallback, useEffect } from 'react';

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
    icon: '📊',
    requiresImage: true
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: '13-point institutional equity research',
    icon: '📑',
    requiresImage: false
  },
  {
    id: 'halal',
    name: 'Halal Check',
    description: 'AAOIFI Shariah compliance screening',
    icon: '✅',
    requiresImage: false
  }
];

export function PromptRunner() {
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartImage, setChartImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const selectedPromptConfig = PROMPT_TYPES.find(p => p.id === selectedPrompt);
  const requiresImage = selectedPromptConfig?.requiresImage ?? false;

  // Check if user is admin
  useEffect(() => {
    fetch('/api/subscription-status')
      .then(res => res.json())
      .then(data => {
        if (data.is_admin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
  }, []);

  const processImage = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setChartImage(base64);
      setError(null);
    };
    reader.onerror = () => {
      setError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!requiresImage) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          processImage(file);
          break;
        }
      }
    }
  }, [processImage, requiresImage]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const clearImage = () => {
    setChartImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearAll = () => {
    setTicker('');
    setResult(null);
    setError(null);
    setChartImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRun = async () => {
    if (!selectedPrompt || !ticker.trim()) {
      setError('Please select a prompt type and enter a ticker');
      return;
    }

    if (requiresImage && !chartImage) {
      setError('Please upload a chart image for ChartGPT analysis');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestBody: Record<string, string | boolean> = {
        prompt_type: selectedPrompt,
        ticker: ticker.trim().toUpperCase()
      };

      if (requiresImage && chartImage) {
        requestBody.image = chartImage;
      }

      if (isAdmin && forceRefresh) {
        requestBody.force_refresh = true;
      }

      const response = await fetch('/api/run-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
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
        <div className="flex items-end gap-2">
          <button
            onClick={handleRun}
            disabled={loading || !selectedPrompt || !ticker.trim() || (requiresImage && !chartImage)}
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
          {(result || ticker || chartImage) && !loading && (
            <button
              onClick={clearAll}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-xl transition-colors"
              title="Clear form and results"
            >
              Clear
            </button>
          )}
          {/* Admin-only: Force Refresh option */}
          {isAdmin && (
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 cursor-pointer">
              <input
                type="checkbox"
                checked={forceRefresh}
                onChange={(e) => setForceRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-yellow-500 text-yellow-500 focus:ring-yellow-500 bg-gray-800"
              />
              Skip Cache
            </label>
          )}
        </div>
      </div>

      {/* Chart Image Upload (ChartGPT only) */}
      {requiresImage && (
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Chart Image <span className="text-red-400">*</span>
          </label>

          {!chartImage ? (
            <div
              ref={dropZoneRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-4xl mb-3">📈</div>
              <div className="text-white font-medium mb-1">
                Drop chart image here or click to upload
              </div>
              <div className="text-sm text-gray-500">
                You can also paste an image from clipboard (Ctrl+V / Cmd+V)
              </div>
              <div className="text-xs text-gray-600 mt-2">
                Supports PNG, JPG, GIF (max 10MB)
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-800">
              <img
                src={chartImage}
                alt="Chart preview"
                className="w-full max-h-[400px] object-contain"
              />
              <button
                onClick={clearImage}
                className="absolute top-3 right-3 p-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
                title="Remove image"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-green-600/90 rounded-lg text-white text-sm">
                Chart ready for analysis
              </div>
            </div>
          )}
        </div>
      )}

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
