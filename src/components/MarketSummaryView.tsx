import { useState, useEffect, useCallback } from 'react';

interface MarketSummary {
  summary_date: string;
  summary_text: string;
  generated_at: string;
}

function renderMarkdown(text: string): string {
  let html = text;

  // Escape HTML entities first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Headers: ### Header
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-white mt-5 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-white mt-6 mb-3">$1</h2>');

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, header: string, _separator: string, body: string) => {
    const headerCells = header.split('|').filter((c: string) => c.trim());
    const headerRow = headerCells.map((c: string) =>
      `<th class="px-3 py-2 text-left text-xs font-medium text-gray-300 uppercase border-b border-gray-600">${c.trim()}</th>`
    ).join('');

    const bodyRows = body.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim());
      return '<tr>' + cells.map((c: string) =>
        `<td class="px-3 py-2 text-sm text-gray-300 border-b border-gray-700/50">${c.trim()}</td>`
      ).join('') + '</tr>';
    }).join('');

    return `<div class="overflow-x-auto my-3"><table class="w-full border-collapse bg-gray-800/50 rounded-lg"><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-700" />');

  // Line breaks to paragraphs (double newline = paragraph break)
  html = html.replace(/\n\n/g, '</p><p class="text-gray-300 mb-3">');

  // Single newlines to <br>
  html = html.replace(/\n/g, '<br/>');

  // Wrap in paragraph
  html = '<p class="text-gray-300 mb-3">' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p class="text-gray-300 mb-3"><\/p>/g, '');
  html = html.replace(/<p class="text-gray-300 mb-3">(<h[23])/g, '$1');
  html = html.replace(/(<\/h[23]>)<\/p>/g, '$1');
  html = html.replace(/<p class="text-gray-300 mb-3">(<div)/g, '$1');
  html = html.replace(/(<\/div>)<\/p>/g, '$1');
  html = html.replace(/<p class="text-gray-300 mb-3">(<hr)/g, '$1');
  html = html.replace(/(\/> )<\/p>/g, '$1');

  return html;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTimestamp(isoStr: string): string {
  const date = new Date(isoStr);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

export function MarketSummaryView() {
  const [summaries, setSummaries] = useState<MarketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/market-summary');
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch summaries: ${text}`);
      }
      const data = await response.json();
      setSummaries(data.summaries || []);
    } catch (err) {
      console.error('Error fetching market summaries:', err);
      setError(err instanceof Error ? err.message : 'Failed to load market summaries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <div className="text-gray-400 text-sm">Loading market summaries...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 text-red-300">
          {error}
        </div>
        <button
          onClick={fetchSummaries}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Market Summary</h2>
          <p className="text-sm text-gray-400 mt-1">
            AI-generated daily market analysis, updated after market close
          </p>
        </div>
        <button
          onClick={fetchSummaries}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {summaries.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400">No market summaries available yet.</p>
          <p className="text-gray-500 text-sm mt-2">
            Summaries are generated on trading days after market close.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {summaries.map((summary) => (
            <div
              key={summary.summary_date}
              className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/80">
                <h3 className="text-lg font-semibold text-white">
                  {formatDate(summary.summary_date)}
                </h3>
                <span className="text-xs text-gray-500">
                  Generated at {formatTimestamp(summary.generated_at)}
                </span>
              </div>
              <div
                className="px-6 py-5 prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(summary.summary_text) }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
