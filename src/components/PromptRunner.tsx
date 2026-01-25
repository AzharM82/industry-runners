import { useState, useRef, useCallback, useEffect } from 'react';
import { jsPDF } from 'jspdf';

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

// Loading messages for different prompt types
const LOADING_MESSAGES: Record<string, string[]> = {
  'chartgpt': [
    'Analyzing chart patterns...',
    'Identifying support and resistance levels...',
    'Evaluating trend indicators...',
    'Calculating entry and exit points...',
    'Assessing risk/reward ratios...',
    'Finalizing technical analysis...'
  ],
  'deep-research': [
    'Fetching market data...',
    'Searching for company information...',
    'Analyzing financial statements...',
    'Evaluating competitive position...',
    'Calculating valuation metrics...',
    'Assessing growth drivers...',
    'Analyzing risk factors...',
    'Computing price targets...',
    'Generating comprehensive report...'
  ],
  'halal': [
    'Fetching financial data...',
    'Searching for company details...',
    'Analyzing business activities...',
    'Calculating debt-to-market cap ratio...',
    'Evaluating interest income ratio...',
    'Checking prohibited revenue sources...',
    'Verifying AAOIFI compliance...',
    'Generating Shariah compliance report...'
  ]
};

interface PromptUsage {
  [key: string]: { used: number; limit: number };
}

export function PromptRunner() {
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartImage, setChartImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [usage, setUsage] = useState<PromptUsage>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const selectedPromptConfig = PROMPT_TYPES.find(p => p.id === selectedPrompt);
  const requiresImage = selectedPromptConfig?.requiresImage ?? false;

  // Rotate loading messages while processing
  useEffect(() => {
    if (!loading || !selectedPrompt) return;

    const messages = LOADING_MESSAGES[selectedPrompt] || ['Processing...'];
    setLoadingMessage(messages[0]);
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep(prev => {
        const nextStep = prev + 1;
        if (nextStep < messages.length) {
          setLoadingMessage(messages[nextStep]);
          return nextStep;
        }
        // Stay on last message
        return prev;
      });
    }, 3000); // Change message every 3 seconds

    return () => clearInterval(interval);
  }, [loading, selectedPrompt]);

  // Fetch user status and usage data
  const fetchUsageData = useCallback(() => {
    fetch('/api/subscription-status')
      .then(res => res.json())
      .then(data => {
        if (data.is_admin) {
          setIsAdmin(true);
        }
        if (data.usage) {
          setUsage(data.usage);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUsageData();
  }, [fetchUsageData]);

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

  const downloadPdf = () => {
    if (!result) return;

    const promptConfig = PROMPT_TYPES.find(p => p.id === result.prompt_type);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let yPosition = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`${promptConfig?.name || 'Analysis'}: ${result.ticker}`, margin, yPosition);
    yPosition += 10;

    // Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | StockPro AI`, margin, yPosition);
    yPosition += 10;

    // Divider line
    doc.setDrawColor(200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Content
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);

    const lines = doc.splitTextToSize(result.result, maxWidth);

    for (const line of lines) {
      if (yPosition > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }

    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('www.stockproai.net', margin, pageHeight - 10);

    // Download
    const filename = `${result.ticker}_${result.prompt_type}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
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
      // Refresh usage data after successful analysis
      fetchUsageData();
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
          {PROMPT_TYPES.map((prompt) => {
            const promptUsage = usage[prompt.id];
            const used = promptUsage?.used || 0;
            const limit = promptUsage?.limit || 30;
            const isLimitReached = used >= limit && !isAdmin;

            return (
              <button
                key={prompt.id}
                onClick={() => !isLimitReached && setSelectedPrompt(prompt.id)}
                disabled={isLimitReached}
                className={`p-4 rounded-xl border-2 text-left transition-all relative ${
                  isLimitReached
                    ? 'border-red-800 bg-red-900/20 cursor-not-allowed opacity-60'
                    : selectedPrompt === prompt.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="text-2xl mb-2">{prompt.icon}</div>
                  {/* Usage Badge */}
                  <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                    isLimitReached
                      ? 'bg-red-900/50 text-red-400'
                      : used > limit * 0.8
                      ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {used}/{limit}
                  </div>
                </div>
                <div className="font-semibold text-white">{prompt.name}</div>
                <div className="text-sm text-gray-400 mt-1">{prompt.description}</div>
                {isLimitReached && (
                  <div className="text-xs text-red-400 mt-2">
                    Monthly limit reached
                  </div>
                )}
              </button>
            );
          })}
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

      {/* Loading Progress Display */}
      {loading && (
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-xl p-6">
          <div className="flex items-center gap-4">
            {/* Animated spinner */}
            <div className="relative">
              <div className="w-12 h-12 border-4 border-blue-500/30 rounded-full"></div>
              <div className="absolute top-0 left-0 w-12 h-12 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg font-semibold text-white">
                  Analyzing {ticker}
                </span>
                <span className="text-xl">
                  {selectedPromptConfig?.icon}
                </span>
              </div>
              <p className="text-blue-300 animate-pulse">
                {loadingMessage}
              </p>

              {/* Progress dots */}
              <div className="flex gap-1 mt-3">
                {(LOADING_MESSAGES[selectedPrompt] || []).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                      idx <= loadingStep ? 'bg-blue-500' : 'bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center">
            This may take 30-60 seconds for comprehensive analysis with web search
          </p>
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
              <button
                onClick={downloadPdf}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                title="Download as PDF"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
              </button>
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
