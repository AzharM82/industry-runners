import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Database,
  Server,
  Zap,
  Cloud,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Activity,
  AlertTriangle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

interface InfrastructureCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency_ms: number | null;
  details: string;
  market_status?: string;
}

interface ApiEndpointCheck {
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  cached: boolean;
  ttl: number | null;
  expected_ttl: number;
  last_refresh: string | null;
  error?: string;
}

interface ApiError {
  endpoint: string;
  error: string;
  details: string | null;
  timestamp: string;
}

interface HealthCheckResult {
  overall_status: 'healthy' | 'unhealthy' | 'degraded';
  infrastructure: InfrastructureCheck[];
  external_services: InfrastructureCheck[];
  api_endpoints: ApiEndpointCheck[];
  recent_errors: ApiError[];
  system_info: {
    beta_mode: boolean;
    market_status: string;
    timestamp: string;
    check_duration_ms: number;
  };
  cached: boolean;
}

export function AdminHealthCheck() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthCheckResult | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const fetchHealthData = useCallback(async (forceRefresh = false) => {
    try {
      setRefreshing(true);
      const url = forceRefresh ? '/api/health-check?refresh=true' : '/api/health-check';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHealthData(data);
      }
    } catch (err) {
      console.error('Failed to fetch health data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (isAdmin) {
      fetchHealthData();
    }
  }, [isAdmin, fetchHealthData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !isAdmin) return;

    const interval = setInterval(() => {
      fetchHealthData(true);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, isAdmin, fetchHealthData]);

  const handleRefresh = () => {
    fetchHealthData(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'unhealthy':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-900/30 border-green-800';
      case 'degraded':
        return 'bg-yellow-900/30 border-yellow-800';
      case 'unhealthy':
        return 'bg-red-900/30 border-red-800';
      default:
        return 'bg-gray-800 border-gray-700';
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getServiceIcon = (name: string) => {
    if (name.includes('PostgreSQL') || name.includes('Database')) {
      return <Database className="w-5 h-5 text-blue-400" />;
    }
    if (name.includes('Redis')) {
      return <Server className="w-5 h-5 text-red-400" />;
    }
    if (name.includes('Polygon')) {
      return <Zap className="w-5 h-5 text-purple-400" />;
    }
    return <Cloud className="w-5 h-5 text-gray-400" />;
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return timestamp;
    }
  };

  // Not admin - show access denied
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-400" />
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
      <div className="max-w-5xl mx-auto space-y-6">
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
              <h1 className="text-2xl font-bold text-white">System Health</h1>
              <p className="text-gray-400 text-sm">Real-time status of all system components</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                autoRefresh
                  ? 'bg-green-900/30 text-green-400 border border-green-800'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
              title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
            >
              {autoRefresh ? (
                <ToggleRight className="w-5 h-5" />
              ) : (
                <ToggleLeft className="w-5 h-5" />
              )}
              <span className="hidden sm:inline text-sm">Auto</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition disabled:opacity-50 border border-gray-700"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
            <RefreshCw className="w-8 h-8 text-gray-500 animate-spin mx-auto mb-4" />
            <div className="text-gray-400">Running health checks...</div>
          </div>
        ) : healthData ? (
          <>
            {/* Overall Status */}
            <div className={`rounded-xl p-6 border ${getStatusBgColor(healthData.overall_status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIcon status={healthData.overall_status} />
                  <div>
                    <div className={`text-lg font-bold ${getStatusColor(healthData.overall_status)}`}>
                      SYSTEM STATUS: {healthData.overall_status.toUpperCase()}
                    </div>
                    <div className="text-sm text-gray-400">
                      Check completed in {healthData.system_info.check_duration_ms}ms
                      {healthData.cached && <span className="ml-2 text-yellow-400">(cached)</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 text-gray-300">
                    <Activity className="w-4 h-4" />
                    <span>Market: {healthData.system_info.market_status.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {healthData.system_info.timestamp}
                  </div>
                </div>
              </div>
            </div>

            {/* Infrastructure */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                <h2 className="font-semibold text-white">Infrastructure</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {healthData.infrastructure.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getServiceIcon(item.name)}
                      <div>
                        <div className="text-white font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.details}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {item.latency_ms !== null && (
                        <div className="flex items-center gap-1 text-gray-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{item.latency_ms}ms</span>
                        </div>
                      )}
                      <div className={`px-3 py-1 rounded-lg text-sm font-medium ${getStatusBgColor(item.status)} ${getStatusColor(item.status)}`}>
                        {item.status.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* External Services */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Cloud className="w-5 h-5 text-purple-400" />
                <h2 className="font-semibold text-white">External Services</h2>
              </div>
              <div className="divide-y divide-gray-700">
                {healthData.external_services.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getServiceIcon(item.name)}
                      <div>
                        <div className="text-white font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.details}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {item.latency_ms !== null ? (
                        <div className="flex items-center gap-1 text-gray-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">{item.latency_ms}ms</span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Config check</div>
                      )}
                      <div className={`px-3 py-1 rounded-lg text-sm font-medium ${getStatusBgColor(item.status)} ${getStatusColor(item.status)}`}>
                        {item.status.toUpperCase()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* API Endpoints */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <h2 className="font-semibold text-white">API Endpoints</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Endpoint</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Cached</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">TTL</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Refresh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {healthData.api_endpoints.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <code className="text-blue-400 text-sm">{item.endpoint}</code>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBgColor(item.status)} ${getStatusColor(item.status)}`}>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.cached ? (
                            <CheckCircle className="w-4 h-4 text-green-400 mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-500 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400 text-sm">
                          {item.ttl !== null ? `${item.ttl}s` : `${item.expected_ttl}s`}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-sm">
                          {item.last_refresh || 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Errors */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                <h2 className="font-semibold text-white">
                  Recent Errors ({healthData.recent_errors.length})
                </h2>
              </div>
              {healthData.recent_errors.length > 0 ? (
                <div className="divide-y divide-gray-700 max-h-64 overflow-y-auto">
                  {healthData.recent_errors.map((error, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-red-400 text-sm">{error.endpoint}</code>
                        <span className="text-xs text-gray-500">{formatTime(error.timestamp)}</span>
                      </div>
                      <div className="text-sm text-gray-300">{error.error}</div>
                      {error.details && (
                        <div className="text-xs text-gray-500 mt-1">{error.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400/50" />
                  No recent errors
                </div>
              )}
            </div>

            {/* System Info */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Server className="w-5 h-5 text-gray-400" />
                <h2 className="font-semibold text-white">System Info</h2>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Beta Mode</div>
                    <div className={healthData.system_info.beta_mode ? 'text-green-400 font-medium' : 'text-gray-400'}>
                      {healthData.system_info.beta_mode ? 'ENABLED' : 'DISABLED'}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Market</div>
                    <div className={`font-medium ${
                      healthData.system_info.market_status === 'open' ? 'text-green-400' : 'text-gray-400'
                    }`}>
                      {healthData.system_info.market_status.toUpperCase()}
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Check Duration</div>
                    <div className="text-white font-medium">{healthData.system_info.check_duration_ms}ms</div>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Last Check</div>
                    <div className="text-white font-medium text-sm">
                      {healthData.system_info.timestamp.split(' ').slice(-3).join(' ')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
            <div className="text-gray-400">Failed to load health data</div>
            <button
              onClick={handleRefresh}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
