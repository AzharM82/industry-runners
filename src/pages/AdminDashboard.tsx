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
  Filter,
  Database,
  Wrench,
  Play,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Mail
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

interface EmailSubscriber {
  id: string;
  email: string;
  name: string | null;
  email_opt_out: boolean;
  subscription_status: string;
  current_period_end: string | null;
  last_send_date: string | null;
  last_status: string | null;
  last_error: string | null;
}

interface EmailTelemetryDay {
  send_date: string;
  total: number;
  sent: number;
  failed: number;
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
  const [activeTab, setActiveTab] = useState<'daily' | 'users' | 'tools' | 'emails' | 'messaging'>('daily');

  // ─── Messaging tab state ──────────────────────────────────────────
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBodyMd, setMsgBodyMd] = useState('');
  const [msgSending, setMsgSending] = useState<'idle' | 'test' | 'all'>('idle');
  const [msgResult, setMsgResult] = useState<unknown>(null);
  const [msgRecipientCount, setMsgRecipientCount] = useState<number | null>(null);
  const [msgConfirmOpen, setMsgConfirmOpen] = useState(false);
  const [broadcastStats, setBroadcastStats] = useState<{
    pending?: number; sending?: number; sent_recent?: number;
    failed_recent?: number; last_sent_at?: string | null;
  } | null>(null);

  // ─── Lightweight Markdown → HTML preview (does not need to match the
  //     server exactly; Python's `markdown` library renders the real email).
  function renderMarkdownPreview(md: string): string {
    const escapeHtml = (s: string) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let h = escapeHtml(md);
    h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre>${code}</pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/^- (.*)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*<\/li>\s*)+/g, (m) => `<ul>${m}</ul>`);
    h = h.replace(/\n{2,}/g, '</p><p>');
    h = h.replace(/\n/g, '<br/>');
    return `<p>${h}</p>`;
  }

  async function fetchBroadcastStats() {
    try {
      const r = await fetch('/api/subscription-status?report=broadcast-stats');
      if (r.ok) {
        const d = await r.json();
        setBroadcastStats(d.broadcast_stats ?? null);
      }
    } catch {
      // ignore
    }
  }

  async function fetchRecipientCount() {
    try {
      const r = await fetch('/api/subscription-status?report=broadcast-recipient-count');
      if (r.ok) {
        const d = await r.json();
        setMsgRecipientCount(typeof d.count === 'number' ? d.count : null);
      }
    } catch {
      // ignore
    }
  }

  async function sendBroadcast(test: boolean) {
    setMsgSending(test ? 'test' : 'all');
    setMsgResult(null);
    try {
      const r = await fetch('/api/broadcast-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: msgSubject, body_md: msgBodyMd, test }),
      });
      const text = await r.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { _http_status: r.status, _raw: text.slice(0, 500) }; }
      setMsgResult(data);
      if (r.ok && !test) {
        // Successful broadcast — wipe form so it can't be re-sent by accident.
        setMsgSubject('');
        setMsgBodyMd('');
      }
      // Refresh the status pill ~5s later (drain might have started by then).
      setTimeout(fetchBroadcastStats, 5000);
    } catch (e) {
      setMsgResult({ error: String(e) });
    } finally {
      setMsgSending('idle');
      setMsgConfirmOpen(false);
    }
  }
  const [refreshing, setRefreshing] = useState(false);

  // Email tab state
  const [emailSubscribers, setEmailSubscribers] = useState<EmailSubscriber[]>([]);
  const [emailTelemetry, setEmailTelemetry] = useState<EmailTelemetryDay[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);

  // Data Tools state
  const [sectorFixDate, setSectorFixDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [breadthFixDate, setBreadthFixDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [realtimeBreadthFixDate, setRealtimeBreadthFixDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [technicalBreadthFixDate, setTechnicalBreadthFixDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toolResults, setToolResults] = useState<Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message?: string }>>({});
  const [subDebugEmail, setSubDebugEmail] = useState('');
  const [subDebugResult, setSubDebugResult] = useState<unknown>(null);
  const [subDebugLoading, setSubDebugLoading] = useState<'idle' | 'debug' | 'sync' | 'sync-all-dry' | 'sync-all'>('idle');

  const runDataTool = async (toolKey: string, url: string) => {
    setToolResults(prev => ({ ...prev, [toolKey]: { status: 'loading' } }));
    try {
      const response = await fetch(url);
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 200) };
      }
      if (response.ok) {
        setToolResults(prev => ({
          ...prev,
          [toolKey]: {
            status: 'success',
            message: (data.message as string) || (data.success ? 'Completed successfully' : JSON.stringify(data).slice(0, 200))
          }
        }));
      } else {
        setToolResults(prev => ({
          ...prev,
          [toolKey]: {
            status: 'error',
            message: (data.error as string) || `HTTP ${response.status}: ${text.slice(0, 100)}`
          }
        }));
      }
    } catch (err) {
      setToolResults(prev => ({
        ...prev,
        [toolKey]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Network error'
        }
      }));
    }
  };

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

  const fetchEmailData = async () => {
    setEmailsLoading(true);
    try {
      const [subsRes, telRes] = await Promise.all([
        fetch('/api/subscription-status?report=email-subscribers'),
        fetch('/api/subscription-status?report=email-telemetry')
      ]);
      if (subsRes.ok) {
        const data = await subsRes.json();
        setEmailSubscribers(data.subscribers || []);
      }
      if (telRes.ok) {
        const data = await telRes.json();
        setEmailTelemetry(data.telemetry || []);
      }
    } catch (err) {
      console.error('Failed to fetch email data:', err);
    } finally {
      setEmailsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchReport(selectedDate);
      fetchUsers();
    }
  }, [isAdmin, selectedDate]);

  useEffect(() => {
    if (isAdmin && activeTab === 'emails') {
      fetchEmailData();
    }
  }, [isAdmin, activeTab]);

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
          <button
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'tools'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            Data Tools
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'emails'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Mail className="w-4 h-4" />
            Emails
          </button>
          <button
            onClick={() => {
              setActiveTab('messaging');
              fetchRecipientCount();
              fetchBroadcastStats();
            }}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === 'messaging'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Mail className="w-4 h-4" />
            Messaging
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

        {activeTab === 'tools' && (
          <>
            {/* Quick Refresh Actions */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold text-white">Quick Refresh</h3>
                <span className="text-gray-500 text-sm ml-2">Force refresh cached data</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Refresh Breadth Data */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-cyan-400" />
                      <span className="text-white font-medium">Breadth Data</span>
                    </div>
                    {toolResults['breadth-refresh']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['breadth-refresh']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['breadth-refresh']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Refresh today's breadth indicators (NH/NL, A/D, Up/Down)</p>
                  <button
                    onClick={() => runDataTool('breadth-refresh', '/api/fix-breadth?action=refresh')}
                    disabled={toolResults['breadth-refresh']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Refresh Today
                  </button>
                  {toolResults['breadth-refresh']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['breadth-refresh']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['breadth-refresh'].message}
                    </p>
                  )}
                </div>

                {/* Refresh Sector Rotation */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-medium">Sector Rotation</span>
                    </div>
                    {toolResults['sector-refresh']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['sector-refresh']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['sector-refresh']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Refresh sector performance and NH/NL data</p>
                  <button
                    onClick={() => runDataTool('sector-refresh', '/api/sector-rotation?refresh=true')}
                    disabled={toolResults['sector-refresh']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Refresh Now
                  </button>
                  {toolResults['sector-refresh']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['sector-refresh']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['sector-refresh'].message}
                    </p>
                  )}
                </div>

                {/* Refresh Both */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-green-400" />
                      <span className="text-white font-medium">Refresh All</span>
                    </div>
                    {toolResults['all-refresh']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['all-refresh']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['all-refresh']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Refresh all market data endpoints</p>
                  <button
                    onClick={async () => {
                      setToolResults(prev => ({ ...prev, 'all-refresh': { status: 'loading' } }));
                      try {
                        await Promise.all([
                          fetch('/api/fix-breadth?action=refresh'),
                          fetch('/api/sector-rotation?refresh=true')
                        ]);
                        setToolResults(prev => ({ ...prev, 'all-refresh': { status: 'success', message: 'All data refreshed' } }));
                      } catch {
                        setToolResults(prev => ({ ...prev, 'all-refresh': { status: 'error', message: 'Refresh failed' } }));
                      }
                    }}
                    disabled={toolResults['all-refresh']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Refresh All
                  </button>
                  {toolResults['all-refresh']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['all-refresh']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['all-refresh'].message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* User Management */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Users className="w-5 h-5 text-yellow-400" />
                <h3 className="font-semibold text-white">User Management</h3>
                <span className="text-gray-500 text-sm ml-2">Fix subscription issues</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fix NONE Users */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-yellow-400" />
                      <span className="text-white font-medium">Fix NONE Users</span>
                    </div>
                    {toolResults['fix-trials']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['fix-trials']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['fix-trials']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Find users with no subscription and create a 3-day trial for them</p>
                  <button
                    onClick={() => runDataTool('fix-trials', '/api/admin-fix-trials')}
                    disabled={toolResults['fix-trials']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:opacity-50"
                  >
                    <Wrench className="w-4 h-4" />
                    Fix NONE Users
                  </button>
                  {toolResults['fix-trials']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['fix-trials']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['fix-trials'].message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Subscription Debug & Sync */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-white">Subscription Debug & Sync</h3>
                <span className="text-gray-500 text-sm ml-2">Debug paid-but-paywall issues for a specific user</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={subDebugEmail}
                    onChange={(e) => setSubDebugEmail(e.target.value)}
                    placeholder="user@email.com"
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={async () => {
                      if (!subDebugEmail) return;
                      setSubDebugLoading('debug');
                      setSubDebugResult(null);
                      try {
                        const r = await fetch(`/api/admin-debug-subscription?email=${encodeURIComponent(subDebugEmail)}`);
                        const text = await r.text();
                        let data: unknown;
                        try {
                          data = JSON.parse(text);
                        } catch {
                          data = {
                            _http_status: r.status,
                            _content_type: r.headers.get('content-type'),
                            _raw_body_preview: text.slice(0, 500) || '(empty body)',
                            _note: 'Response was not valid JSON — likely endpoint not found or auth redirect.',
                          };
                        }
                        setSubDebugResult(data);
                      } catch (e) {
                        setSubDebugResult({ error: String(e) });
                      } finally {
                        setSubDebugLoading('idle');
                      }
                    }}
                    disabled={!subDebugEmail || subDebugLoading !== 'idle'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {subDebugLoading === 'debug' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Debug
                  </button>
                  <button
                    onClick={async () => {
                      if (!subDebugEmail) return;
                      setSubDebugLoading('sync');
                      setSubDebugResult(null);
                      try {
                        const r = await fetch('/api/admin-sync-subscription', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email: subDebugEmail }),
                        });
                        const text = await r.text();
                        let data: unknown;
                        try {
                          data = JSON.parse(text);
                        } catch {
                          data = {
                            _http_status: r.status,
                            _content_type: r.headers.get('content-type'),
                            _raw_body_preview: text.slice(0, 500) || '(empty body)',
                            _note: 'Response was not valid JSON — likely endpoint not found or auth redirect.',
                          };
                        }
                        setSubDebugResult(data);
                      } catch (e) {
                        setSubDebugResult({ error: String(e) });
                      } finally {
                        setSubDebugLoading('idle');
                      }
                    }}
                    disabled={!subDebugEmail || subDebugLoading !== 'idle'}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {subDebugLoading === 'sync' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                    Force Sync from Stripe
                  </button>
                </div>
                <p className="text-gray-400 text-xs">
                  <strong>Debug</strong>: Shows DB state (user record, all subscriptions, active sub). &nbsp;
                  <strong>Force Sync</strong>: Looks up customer in Stripe by email and creates/links the subscription in our DB.
                </p>

                <div className="border-t border-gray-700 pt-3 mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      setSubDebugLoading('sync-all-dry');
                      setSubDebugResult(null);
                      try {
                        const r = await fetch('/api/admin-sync-all-stripe?dry=1', { method: 'POST' });
                        const text = await r.text();
                        try {
                          setSubDebugResult(JSON.parse(text));
                        } catch {
                          setSubDebugResult({ _http_status: r.status, _raw_body_preview: text.slice(0, 500) });
                        }
                      } catch (e) {
                        setSubDebugResult({ error: String(e) });
                      } finally {
                        setSubDebugLoading('idle');
                      }
                    }}
                    disabled={subDebugLoading !== 'idle'}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {subDebugLoading === 'sync-all-dry' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                    Sync All from Stripe (Dry Run)
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('This will scan every active/trialing/past_due Stripe subscription and create or update DB records to match. Safe to re-run. Proceed?')) return;
                      setSubDebugLoading('sync-all');
                      setSubDebugResult(null);
                      try {
                        const r = await fetch('/api/admin-sync-all-stripe', { method: 'POST' });
                        const text = await r.text();
                        try {
                          setSubDebugResult(JSON.parse(text));
                        } catch {
                          setSubDebugResult({ _http_status: r.status, _raw_body_preview: text.slice(0, 500) });
                        }
                      } catch (e) {
                        setSubDebugResult({ error: String(e) });
                      } finally {
                        setSubDebugLoading('idle');
                      }
                    }}
                    disabled={subDebugLoading !== 'idle'}
                    className="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {subDebugLoading === 'sync-all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                    Sync All from Stripe (Apply)
                  </button>
                  <span className="text-gray-500 text-xs self-center">
                    Reconciles every Stripe subscription against the DB. Use Dry Run first to preview changes.
                  </span>
                </div>

                {subDebugResult !== null && (
                  <pre className="bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto max-h-96 overflow-y-auto">
                    {JSON.stringify(subDebugResult, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            {/* Date-Specific Fix Tools */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-orange-400" />
                <h3 className="font-semibold text-white">Fix Historical Data</h3>
                <span className="text-gray-500 text-sm ml-2">Recalculate data for a specific date</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {/* Fix Sector NH/NL */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-orange-400" />
                      <span className="text-white font-medium">Fix Sector NH/NL</span>
                    </div>
                    {toolResults['sector-fix']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['sector-fix']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['sector-fix']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Recalculate 15-day high/low and update NH/NL history</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <input
                      type="date"
                      value={sectorFixDate}
                      onChange={(e) => setSectorFixDate(e.target.value)}
                      className="flex-1 bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:border-orange-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => runDataTool('sector-fix', `/api/fix-sector-nhnl?date=${sectorFixDate}`)}
                    disabled={toolResults['sector-fix']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
                  >
                    <Wrench className="w-4 h-4" />
                    Fix {sectorFixDate}
                  </button>
                  {toolResults['sector-fix']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['sector-fix']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['sector-fix'].message}
                    </p>
                  )}
                </div>

                {/* Delete Breadth Snapshot */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-red-400" />
                      <span className="text-white font-medium">Delete Breadth Snapshot</span>
                    </div>
                    {toolResults['breadth-delete']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['breadth-delete']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['breadth-delete']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Remove bad breadth snapshot (use if data is corrupt)</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <input
                      type="date"
                      value={breadthFixDate}
                      onChange={(e) => setBreadthFixDate(e.target.value)}
                      className="flex-1 bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:border-red-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => runDataTool('breadth-delete', `/api/fix-breadth?action=delete&date=${breadthFixDate}`)}
                    disabled={toolResults['breadth-delete']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Delete {breadthFixDate}
                  </button>
                  {toolResults['breadth-delete']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['breadth-delete']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['breadth-delete'].message}
                    </p>
                  )}
                </div>

                {/* Fix Real-Time Breadth */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-cyan-400" />
                      <span className="text-white font-medium">Fix Real-Time Breadth</span>
                    </div>
                    {toolResults['realtime-breadth-fix']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['realtime-breadth-fix']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['realtime-breadth-fix']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Backfill real-time breadth (Up/Down 4%, ratios, T2108) from Polygon historical data</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <input
                      type="date"
                      value={realtimeBreadthFixDate}
                      onChange={(e) => setRealtimeBreadthFixDate(e.target.value)}
                      className="flex-1 bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:border-cyan-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => runDataTool('realtime-breadth-fix', `/api/fix-realtime-breadth?date=${realtimeBreadthFixDate}`)}
                    disabled={toolResults['realtime-breadth-fix']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition disabled:opacity-50"
                  >
                    <Wrench className="w-4 h-4" />
                    Fix {realtimeBreadthFixDate}
                  </button>
                  {toolResults['realtime-breadth-fix']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['realtime-breadth-fix']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['realtime-breadth-fix'].message}
                    </p>
                  )}
                </div>

                {/* Fix Technical Breadth */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-400" />
                      <span className="text-white font-medium">Fix Technical Breadth</span>
                    </div>
                    {toolResults['technical-breadth-fix']?.status === 'loading' && (
                      <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                    )}
                    {toolResults['technical-breadth-fix']?.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {toolResults['technical-breadth-fix']?.status === 'error' && (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mb-3">Refresh today's Finviz data (52wk H/L, RSI, SMA) and save as snapshot for a date</p>
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <input
                      type="date"
                      value={technicalBreadthFixDate}
                      onChange={(e) => setTechnicalBreadthFixDate(e.target.value)}
                      className="flex-1 bg-gray-700 text-white px-3 py-1.5 rounded-lg border border-gray-600 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={() => runDataTool('technical-breadth-fix', `/api/fix-breadth?action=refresh&date=${technicalBreadthFixDate}`)}
                    disabled={toolResults['technical-breadth-fix']?.status === 'loading'}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    <Wrench className="w-4 h-4" />
                    Fix {technicalBreadthFixDate}
                  </button>
                  {toolResults['technical-breadth-fix']?.message && (
                    <p className={`mt-2 text-xs ${toolResults['technical-breadth-fix']?.status === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                      {toolResults['technical-breadth-fix'].message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Debug Tools */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white">Debug Information</h3>
                <span className="text-gray-500 text-sm ml-2">View raw data and diagnostics</span>
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Debug Breadth */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-medium">Breadth Debug</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-3">View raw Redis data, stored dates, and timezone info</p>
                  <a
                    href="/api/debug-breadth"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Database className="w-4 h-4" />
                    Open Debug View
                  </a>
                </div>

                {/* Sector NH/NL History */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-medium">Sector NH/NL History</span>
                  </div>
                  <p className="text-gray-400 text-sm mb-3">View cached sector new highs/lows history</p>
                  <a
                    href="/api/sector-rotation?history=true"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    <Database className="w-4 h-4" />
                    Open History View
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'emails' && (
          <>
            {emailsLoading ? (
              <div className="bg-gray-800 rounded-xl p-12 border border-gray-700 text-center">
                <div className="text-gray-400">Loading email data...</div>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Subscribers</span>
                      <Mail className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-3xl font-bold text-green-400">
                      {emailSubscribers.filter(s => !s.email_opt_out).length}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">opted in</div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Opted Out</span>
                      <X className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="text-3xl font-bold text-red-400">
                      {emailSubscribers.filter(s => s.email_opt_out).length}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">unsubscribed</div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Last Send</span>
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-3xl font-bold text-blue-400">
                      {emailTelemetry.length > 0 ? emailTelemetry[0].sent : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {emailTelemetry.length > 0 ? emailTelemetry[0].send_date : 'no sends yet'}
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-gray-400">Last Failed</span>
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="text-3xl font-bold text-yellow-400">
                      {emailTelemetry.length > 0 ? emailTelemetry[0].failed : 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {emailTelemetry.length > 0 ? emailTelemetry[0].send_date : 'no sends yet'}
                    </div>
                  </div>
                </div>

                {/* Subscribers Table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-white">Email Subscribers ({emailSubscribers.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-900/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Email</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Opt Out</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Expires</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Sent</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Delivery</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {emailSubscribers.map((sub) => (
                          <tr key={sub.id} className="hover:bg-gray-700/30">
                            <td className="px-4 py-3 text-white font-medium">{sub.email}</td>
                            <td className="px-4 py-3 text-gray-400 text-sm">{sub.name || '-'}</td>
                            <td className="px-4 py-3 text-center">
                              {sub.subscription_status === 'active' ? (
                                <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs font-medium">PAID</span>
                              ) : (
                                <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-medium">TRIAL</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {sub.email_opt_out ? (
                                <span className="text-red-400 text-xs font-medium">YES</span>
                              ) : (
                                <span className="text-green-400 text-xs font-medium">NO</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-sm">
                              {sub.current_period_end
                                ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-sm">
                              {sub.last_send_date || '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {sub.last_status === 'sent' ? (
                                <CheckCircle className="w-4 h-4 text-green-400 inline" />
                              ) : sub.last_status === 'failed' ? (
                                <span title={sub.last_error || 'Failed'}>
                                  <AlertCircle className="w-4 h-4 text-red-400 inline" />
                                </span>
                              ) : (
                                <span className="text-gray-500 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {emailSubscribers.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                              No active subscribers found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Telemetry Table */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold text-white">Send Telemetry (Last 30 Days)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-900/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Total</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Sent</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Failed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {emailTelemetry.map((day) => (
                          <tr key={day.send_date} className="hover:bg-gray-700/30">
                            <td className="px-4 py-3 text-white text-sm">{day.send_date}</td>
                            <td className="px-4 py-3 text-center text-gray-300">{day.total}</td>
                            <td className="px-4 py-3 text-center text-green-400">{day.sent}</td>
                            <td className="px-4 py-3 text-center text-red-400">{day.failed}</td>
                          </tr>
                        ))}
                        {emailTelemetry.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                              No email sends recorded yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'messaging' && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Send a Message to Subscribers</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Plain Subject + Markdown body. Goes to all <strong>paid</strong> subscribers who have not opted out.
                  </p>
                </div>
                <button
                  onClick={fetchBroadcastStats}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1.5"
                  title="Refresh status"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {broadcastStats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-4">
                  <div className="bg-gray-900 rounded px-3 py-2"><span className="text-gray-500">Pending:</span> <span className="text-white font-bold">{broadcastStats.pending ?? 0}</span></div>
                  <div className="bg-gray-900 rounded px-3 py-2"><span className="text-gray-500">Sending:</span> <span className="text-yellow-400 font-bold">{broadcastStats.sending ?? 0}</span></div>
                  <div className="bg-gray-900 rounded px-3 py-2"><span className="text-gray-500">Sent (24h):</span> <span className="text-green-400 font-bold">{broadcastStats.sent_recent ?? 0}</span></div>
                  <div className="bg-gray-900 rounded px-3 py-2"><span className="text-gray-500">Failed (24h):</span> <span className="text-red-400 font-bold">{broadcastStats.failed_recent ?? 0}</span></div>
                  <div className="bg-gray-900 rounded px-3 py-2"><span className="text-gray-500">Last sent:</span> <span className="text-white">{broadcastStats.last_sent_at ? new Date(broadcastStats.last_sent_at).toLocaleString() : '—'}</span></div>
                </div>
              )}

              <label className="block text-sm text-gray-400 mb-1">Subject</label>
              <input
                type="text"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                placeholder="e.g. New feature: Day Trading scanner is live"
                maxLength={250}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Body (Markdown — `**bold**`, `[link](url)`, `- bullets`)
                  </label>
                  <textarea
                    value={msgBodyMd}
                    onChange={(e) => setMsgBodyMd(e.target.value)}
                    placeholder={"Hi everyone,\n\nWe just shipped **X**. Read more at [our blog](https://www.stockproai.net).\n\n- Bullet 1\n- Bullet 2\n\nThanks,\nAzhar"}
                    rows={14}
                    maxLength={50000}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 font-mono text-sm focus:outline-none focus:border-purple-500"
                  />
                  <div className="text-xs text-gray-500 mt-1">{msgBodyMd.length} / 50,000 chars</div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Preview</label>
                  <div
                    className="prose prose-invert max-w-none bg-white text-gray-900 rounded-lg p-4 text-sm h-[336px] overflow-y-auto border border-gray-700"
                    dangerouslySetInnerHTML={{
                      __html: msgBodyMd
                        ? renderMarkdownPreview(msgBodyMd)
                        : '<p style="color:#9ca3af">Preview will appear here as you type…</p>',
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <button
                  onClick={() => sendBroadcast(true)}
                  disabled={msgSending !== 'idle' || !msgSubject.trim() || !msgBodyMd.trim()}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                  title="Sends a test only to reachazhar@hotmail.com"
                >
                  {msgSending === 'test' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send test to me
                </button>
                <button
                  onClick={() => setMsgConfirmOpen(true)}
                  disabled={msgSending !== 'idle' || !msgSubject.trim() || !msgBodyMd.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                >
                  {msgSending === 'all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send to all paid subscribers
                  {msgRecipientCount !== null && (
                    <span className="bg-purple-800 text-xs px-2 py-0.5 rounded-full">{msgRecipientCount}</span>
                  )}
                </button>
                <span className="text-xs text-gray-500">Test always goes to <code>reachazhar@hotmail.com</code></span>
              </div>

              {msgResult !== null && (
                <pre className="mt-4 bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto max-h-64">
                  {JSON.stringify(msgResult, null, 2)}
                </pre>
              )}
            </div>

            {msgConfirmOpen && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6">
                  <h3 className="text-lg font-bold text-white mb-2">Confirm broadcast</h3>
                  <p className="text-sm text-gray-300 mb-4">
                    About to email{' '}
                    <strong className="text-purple-400">{msgRecipientCount ?? '?'}</strong> paid subscribers with subject:
                  </p>
                  <p className="bg-gray-800 rounded p-3 text-sm text-white mb-4 break-words">{msgSubject}</p>
                  <p className="text-xs text-gray-500 mb-4">
                    This cannot be undone. Recipients are queued in DB and the timer-driven drain function (every ~30 sec) will send via Gmail SMTP.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setMsgConfirmOpen(false)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => sendBroadcast(false)}
                      disabled={msgSending !== 'idle'}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
                    >
                      {msgSending === 'all' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Send now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
