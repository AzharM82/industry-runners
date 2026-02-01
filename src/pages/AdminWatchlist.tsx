import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  X,
  List,
  TrendingUp,
  AlertCircle,
  Check
} from 'lucide-react';

export function AdminWatchlist() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const response = await fetch('/api/subscription-status');
        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.is_admin === true);
        } else {
          setIsAdmin(false);
        }
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  // Fetch current watchlist
  const fetchWatchlist = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/manage_watchlist');
      if (response.ok) {
        const data = await response.json();
        setWatchlist(data.watchlist || []);
      } else {
        setError('Failed to load watchlist');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchWatchlist();
    }
  }, [isAdmin]);

  // Add a ticker
  const handleAddTicker = async () => {
    const ticker = newTicker.toUpperCase().trim();
    if (!ticker) return;
    if (watchlist.includes(ticker)) {
      setError(`${ticker} is already in the watchlist`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/manage_watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      });
      if (response.ok) {
        const data = await response.json();
        setWatchlist(data.watchlist || []);
        setNewTicker('');
        setSuccess(`Added ${ticker}`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError(`Failed to add ${ticker}`);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  };

  // Remove a ticker
  const handleRemoveTicker = async (ticker: string) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/manage_watchlist?ticker=${ticker}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const data = await response.json();
        setWatchlist(data.watchlist || []);
        setSuccess(`Removed ${ticker}`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError(`Failed to remove ${ticker}`);
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setSaving(false);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTicker();
    }
  };

  // Not admin - show access denied
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-6">This page is only accessible to administrators.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Loading admin check
  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Checking permissions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Stock Watchlist</h1>
              <p className="text-gray-400 text-sm">Configure which stocks to scan for the leaderboard</p>
            </div>
          </div>
          <button
            onClick={fetchWatchlist}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-900/30 border border-green-700 rounded-lg p-3 flex items-center gap-2 text-green-400">
            <Check className="w-5 h-5" />
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Add Ticker Form */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Add Stock to Watchlist</h3>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="Enter ticker symbol (e.g., AAPL)"
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              disabled={saving}
            />
            <button
              onClick={handleAddTicker}
              disabled={saving || !newTicker.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-2">
            Stocks in this list will be scanned during premarket, market hours, and evening scans.
          </p>
        </div>

        {/* Current Watchlist */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">Current Watchlist ({watchlist.length})</h3>
            </div>
            <div className="text-sm text-gray-400">
              {watchlist.length === 0 ? 'No stocks added yet' : `${watchlist.length} stocks`}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading watchlist...</div>
          ) : watchlist.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No stocks in watchlist</p>
              <p className="text-gray-500 text-sm mt-1">Add stocks above to start scanning</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {watchlist.map((ticker) => (
                <div
                  key={ticker}
                  className="px-4 py-3 flex items-center justify-between hover:bg-gray-700/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-white font-medium text-lg">{ticker}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveTicker(ticker)}
                    disabled={saving}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition disabled:opacity-50"
                    title={`Remove ${ticker}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-5">
          <h4 className="text-blue-400 font-medium mb-2">How it works</h4>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• <strong>Premarket scan</strong> runs at 6:15 AM PST - analyzes overnight news</li>
            <li>• <strong>Market scan</strong> runs every 10 min during market hours - tracks breaking news</li>
            <li>• <strong>Evening scan</strong> runs at 6:00 PM ET - prepares next day opportunities</li>
            <li>• Each stock is scored on News (35%), Technicals (40%), and Fundamentals (25%)</li>
            <li>• Results appear on the Leaderboard page, ranked by composite score</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
