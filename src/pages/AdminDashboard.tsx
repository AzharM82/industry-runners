import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  LogIn,
  Activity,
  Calendar,
  ArrowLeft,
  RefreshCw,
  Brain,
  ChevronLeft,
  ChevronRight,
  Server,
  HeartPulse,
  CreditCard,
  Clock,
  Phone,
  X,
  Filter
} from 'lucide-react';

interface DailyReport {
  date: string;
  new_signups: number;
  new_signup_list: Array<{
    email: string;
    name: string;
    created_at: string;
  }>;
  unique_logins: number;
  total_logins: number;
  login_list: Array<{
    email: string;
    last_login: string;
  }>;
  prompts_used: Record<string, number>;
  total_users: number;
  active_users_7d: number;
}

interface UserStats {
  id: string;
  email: string;
  name: string;
  phone_number: string | null;
  has_phone: boolean;
  auth_provider: string | null;
  subscription_status: string | null;
  is_trial: boolean;
  subscription_expires: string | null;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  prompt_count: number;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [activeTab, setActiveTab] = useState<'daily' | 'users'>('daily');
  const [refreshing, setRefreshing] = useState(false);

  // Filter state for Users tab
  const [statusFilter, setStatusFilter] = useState<'active' | 'trialing' | 'none' | null>(null);
  const [hasPhoneFilter, setHasPhoneFilter] = useState<boolean | null>(null);
  const [emailFilter, setEmailFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);

  // Get unique auth providers for filter dropdown
  const authProviders = useMemo(() => {
    const providers = new Set(users.map(u => u.auth_provider || 'google'));
    return Array.from(providers).sort();
  }, [users]);

  // Filter users based on active filters
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Status filter
      if (statusFilter === 'active' && user.subscription_status !== 'active') return false;
      if (statusFilter === 'trialing' && user.subscription_status !== 'trialing') return false;
      if (statusFilter === 'none' && user.subscription_status) return false;

      // Phone filter
      if (hasPhoneFilter === true && !user.has_phone) return false;
      if (hasPhoneFilter === false && user.has_phone) return false;

      // Email filter (case insensitive)
      if (emailFilter && !user.email.toLowerCase().includes(emailFilter.toLowerCase())) return false;

      // Provider filter
      if (providerFilter && (user.auth_provider || 'google') !== providerFilter) return false;

      return true;
    });
  }, [users, statusFilter, hasPhoneFilter, emailFilter, providerFilter]);

  const hasActiveFilters = statusFilter !== null || hasPhoneFilter !== null || emailFilter !== '' || providerFilter !== null;

  const clearAllFilters = () => {
    setStatusFilter(null);
    setHasPhoneFilter(null);
    setEmailFilter('');
    setProviderFilter(null);
  };

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

  // Fetch daily report (using subscription-status endpoint which we know works)
  const fetchReport = async (date: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/subscription-status?report=daily&date=${date}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
      } else {
        console.error('Failed to fetch report:', response.status);
      }
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch all users (using subscription-status endpoint which we know works)
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/subscription-status?report=users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        console.error('Failed to fetch users:', response.status);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchReport(selectedDate);
      fetchUsers();
    }
  }, [isAdmin, selectedDate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReport(selectedDate);
    await fetchUsers();
    setRefreshing(false);
  };

  const changeDate = (days: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + days);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Not admin - show access denied
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-red-400" />
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-gray-400 text-sm">User analytics and activity reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/health')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
            >
              <HeartPulse className="w-4 h-4" />
              Health
            </button>
            <button
              onClick={() => navigate('/admin/system')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition"
            >
              <Server className="w-4 h-4" />
              System Info
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'daily'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Daily Report
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            All Users ({users.length})
          </button>
        </div>

        {activeTab === 'daily' && (
          <>
            {/* Date Selector */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
              <button
                onClick={() => changeDate(-1)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-blue-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-400">{formatDate(selectedDate)}</span>
              </div>
              <button
                onClick={() => changeDate(1)}
                disabled={selectedDate >= new Date().toISOString().split('T')[0]}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {loading ? (
              <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
                <div className="text-gray-400">Loading report...</div>
              </div>
            ) : report ? (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">New Signups</span>
                      <UserPlus className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-3xl font-bold text-green-400">{report.new_signups}</div>
                    <div className="text-xs text-gray-500 mt-1">today</div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Unique Logins</span>
                      <LogIn className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-3xl font-bold text-blue-400">{report.unique_logins}</div>
                    <div className="text-xs text-gray-500 mt-1">{report.total_logins} total sessions</div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Total Users</span>
                      <Users className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-3xl font-bold text-purple-400">{report.total_users}</div>
                    <div className="text-xs text-gray-500 mt-1">registered</div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Active (7d)</span>
                      <Activity className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="text-3xl font-bold text-yellow-400">{report.active_users_7d}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {report.total_users > 0
                        ? `${((report.active_users_7d / report.total_users) * 100).toFixed(0)}% of users`
                        : '0%'}
                    </div>
                  </div>
                </div>

                {/* AI Prompts Used */}
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold text-white">AI Prompts Used Today</h3>
                  </div>
                  {Object.keys(report.prompts_used).length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(report.prompts_used).map(([type, count]) => (
                        <div key={type} className="bg-gray-700/50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-white">{count}</div>
                          <div className="text-xs text-gray-400 capitalize">{type.replace('-', ' ')}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-4">No AI prompts used today</div>
                  )}
                </div>

                {/* New Signups List */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-green-400" />
                    <h3 className="font-semibold text-white">New Signups ({report.new_signups})</h3>
                  </div>
                  {report.new_signup_list.length > 0 ? (
                    <div className="divide-y divide-gray-700">
                      {report.new_signup_list.map((user, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <div className="text-white font-medium">{user.email}</div>
                            <div className="text-xs text-gray-500">{user.name}</div>
                          </div>
                          <div className="text-sm text-gray-400">
                            {formatDateTime(user.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">No new signups today</div>
                  )}
                </div>

                {/* Logins List */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <LogIn className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-white">Logins Today ({report.unique_logins})</h3>
                  </div>
                  {report.login_list.length > 0 ? (
                    <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
                      {report.login_list.map((login, idx) => (
                        <div key={idx} className="px-4 py-3 flex items-center justify-between">
                          <div className="text-white">{login.email}</div>
                          <div className="text-sm text-gray-400">
                            {formatDateTime(login.last_login)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-gray-500">No logins today</div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
                <div className="text-gray-400">Failed to load report</div>
              </div>
            )}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {/* User Stats Summary - Clickable Filter Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={() => setStatusFilter(statusFilter === 'active' ? null : 'active')}
                className={`bg-gray-800 rounded-xl p-5 border transition-all text-left ${
                  statusFilter === 'active'
                    ? 'border-green-500 ring-2 ring-green-500/30'
                    : 'border-gray-700 hover:border-green-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">Paid Users</span>
                  <CreditCard className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-3xl font-bold text-green-400">
                  {users.filter(u => u.subscription_status === 'active').length}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {statusFilter === 'active' ? '✓ Filtering' : 'Click to filter'}
                </div>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'trialing' ? null : 'trialing')}
                className={`bg-gray-800 rounded-xl p-5 border transition-all text-left ${
                  statusFilter === 'trialing'
                    ? 'border-blue-500 ring-2 ring-blue-500/30'
                    : 'border-gray-700 hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">Trial Users</span>
                  <Clock className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-3xl font-bold text-blue-400">
                  {users.filter(u => u.subscription_status === 'trialing').length}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {statusFilter === 'trialing' ? '✓ Filtering' : 'Click to filter'}
                </div>
              </button>

              <button
                onClick={() => setStatusFilter(statusFilter === 'none' ? null : 'none')}
                className={`bg-gray-800 rounded-xl p-5 border transition-all text-left ${
                  statusFilter === 'none'
                    ? 'border-red-500 ring-2 ring-red-500/30'
                    : 'border-gray-700 hover:border-red-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">No Subscription</span>
                  <Users className="w-5 h-5 text-red-400" />
                </div>
                <div className="text-3xl font-bold text-red-400">
                  {users.filter(u => !u.subscription_status).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {statusFilter === 'none' ? '✓ Filtering' : 'Click to filter'}
                </div>
              </button>

              <button
                onClick={() => setHasPhoneFilter(hasPhoneFilter === true ? null : true)}
                className={`bg-gray-800 rounded-xl p-5 border transition-all text-left ${
                  hasPhoneFilter === true
                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                    : 'border-gray-700 hover:border-purple-500/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">Has Phone</span>
                  <Phone className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-3xl font-bold text-purple-400">
                  {users.filter(u => u.has_phone).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {hasPhoneFilter === true ? '✓ Filtering' : 'Click to filter'}
                </div>
              </button>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-white">
                  {hasActiveFilters
                    ? `Filtered Users (${filteredUsers.length} of ${users.length})`
                    : `All Users (${users.length})`
                  }
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 text-red-400 rounded-lg hover:bg-red-900/50 transition text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Clear Filters
                  </button>
                )}
                <div className="text-sm text-gray-400">
                  Sorted by signup date (newest first)
                </div>
              </div>
            </div>

            {/* Filter Row */}
            <div className="p-3 bg-gray-900/30 border-b border-gray-700 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500 uppercase">Filters:</span>
              </div>

              {/* Email Filter */}
              <input
                type="text"
                placeholder="Search email..."
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500 w-48"
              />

              {/* Status Filter Dropdown */}
              <select
                value={statusFilter || ''}
                onChange={(e) => setStatusFilter(e.target.value as 'active' | 'trialing' | 'none' | null || null)}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="active">Paid</option>
                <option value="trialing">Trial</option>
                <option value="none">No Subscription</option>
              </select>

              {/* Provider Filter Dropdown */}
              <select
                value={providerFilter || ''}
                onChange={(e) => setProviderFilter(e.target.value || null)}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Providers</option>
                {authProviders.map(provider => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>

              {/* Phone Filter Dropdown */}
              <select
                value={hasPhoneFilter === null ? '' : hasPhoneFilter ? 'yes' : 'no'}
                onChange={(e) => {
                  if (e.target.value === '') setHasPhoneFilter(null);
                  else if (e.target.value === 'yes') setHasPhoneFilter(true);
                  else setHasPhoneFilter(false);
                }}
                className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded-lg border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Phone</option>
                <option value="yes">Has Phone</option>
                <option value="no">No Phone</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Phone</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Provider</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Logins</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Prompts</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Signed Up</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">{user.email}</div>
                        {user.name && <div className="text-xs text-gray-500">{user.name}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {user.phone_number ? (
                          <span className="text-green-400 text-sm">{user.phone_number}</span>
                        ) : (
                          <span className="text-gray-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.subscription_status === 'active' ? (
                          <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs font-medium">
                            PAID
                          </span>
                        ) : user.subscription_status === 'trialing' ? (
                          <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-medium">
                            TRIAL
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs font-medium">
                            NONE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-400 capitalize">
                          {user.auth_provider || 'google'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-sm">
                          {user.login_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-purple-900/30 text-purple-400 rounded text-sm">
                          {user.prompt_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatDateTime(user.created_at).split(',')[0]}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {user.last_login_at ? formatDateTime(user.last_login_at) : 'Never'}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <div className="text-gray-500">
                          {hasActiveFilters ? (
                            <>
                              <p className="mb-2">No users match the current filters</p>
                              <button
                                onClick={clearAllFilters}
                                className="text-blue-400 hover:text-blue-300 text-sm"
                              >
                                Clear all filters
                              </button>
                            </>
                          ) : (
                            <p>No users found</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
