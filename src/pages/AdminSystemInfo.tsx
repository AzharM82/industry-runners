import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Server,
  Database,
  Globe,
  Github,
  Shield,
  Copy,
  Check,
  ExternalLink,
  HardDrive,
  Cloud,
  Users,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

export function AdminSystemInfo() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

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

  const copyToClipboard = (text: string, item: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(item);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  // Not admin - show access denied
  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
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

  const CopyButton = ({ text, item }: { text: string; item: string }) => (
    <button
      onClick={() => copyToClipboard(text, item)}
      className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition"
      title="Copy to clipboard"
    >
      {copiedItem === item ? (
        <Check className="w-4 h-4 text-green-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );

  const ExternalLinkButton = ({ url }: { url: string }) => (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded transition"
      title="Open in new tab"
    >
      <ExternalLink className="w-4 h-4" />
    </a>
  );

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">System Information</h1>
            <p className="text-gray-400 text-sm">Infrastructure, backup, and deployment details</p>
          </div>
        </div>

        {/* App URLs */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-white">Application URLs</h2>
          </div>
          <div className="divide-y divide-gray-700">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Production</div>
                <div className="text-sm text-gray-400">Primary application URL</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-green-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  https://www.stockproai.net
                </code>
                <CopyButton text="https://www.stockproai.net" item="prod-url" />
                <ExternalLinkButton url="https://www.stockproai.net" />
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Backup Site</div>
                <div className="text-sm text-gray-400">Hot standby for disaster recovery</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-yellow-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  https://orange-forest-0960f250f.4.azurestaticapps.net
                </code>
                <CopyButton text="https://orange-forest-0960f250f.4.azurestaticapps.net" item="backup-url" />
                <ExternalLinkButton url="https://orange-forest-0960f250f.4.azurestaticapps.net" />
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Admin Dashboard</div>
                <div className="text-sm text-gray-400">User analytics and reports</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-purple-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  https://www.stockproai.net/admin
                </code>
                <CopyButton text="https://www.stockproai.net/admin" item="admin-url" />
                <ExternalLinkButton url="https://www.stockproai.net/admin" />
              </div>
            </div>
          </div>
        </div>

        {/* GitHub Repositories */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <Github className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-white">GitHub Repositories</h2>
          </div>
          <div className="divide-y divide-gray-700">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Primary Repository</div>
                <div className="text-sm text-gray-400">Main source code repository</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-blue-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  AzharM82/industry-runners
                </code>
                <CopyButton text="https://github.com/AzharM82/industry-runners" item="github-main" />
                <ExternalLinkButton url="https://github.com/AzharM82/industry-runners" />
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Backup Repository</div>
                <div className="text-sm text-gray-400">Code backup mirror</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-yellow-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  AzharM82/stockproai-backup
                </code>
                <CopyButton text="https://github.com/AzharM82/stockproai-backup" item="github-backup" />
                <ExternalLinkButton url="https://github.com/AzharM82/stockproai-backup" />
              </div>
            </div>
          </div>
        </div>

        {/* Azure Resources */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-white">Azure Resources</h2>
          </div>
          <div className="divide-y divide-gray-700">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-green-400" />
                <div>
                  <div className="text-white font-medium">Static Web App (Primary)</div>
                  <div className="text-sm text-gray-400">industry-runners</div>
                </div>
              </div>
              <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-sm">Active</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-yellow-400" />
                <div>
                  <div className="text-white font-medium">Static Web App (Backup)</div>
                  <div className="text-sm text-gray-400">stockproai-backup</div>
                </div>
              </div>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded text-sm">Standby</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-blue-400" />
                <div>
                  <div className="text-white font-medium">PostgreSQL Database</div>
                  <div className="text-sm text-gray-400">stockproai-db (Flexible Server)</div>
                </div>
              </div>
              <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-sm">7-day backup</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-red-400" />
                <div>
                  <div className="text-white font-medium">Redis Cache</div>
                  <div className="text-sm text-gray-400">industry-runners-cache (Basic tier)</div>
                </div>
              </div>
              <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded text-sm">No persistence</span>
            </div>
          </div>
        </div>

        {/* Backup Commands */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-green-400" />
            <h2 className="font-semibold text-white">Backup Commands</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-2">Sync code to backup repository:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-green-400 bg-gray-900 px-3 py-2 rounded text-sm font-mono">
                  git push origin master && git push backup master
                </code>
                <CopyButton text="git push origin master && git push backup master" item="cmd-sync" />
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-2">Deploy to backup Static Web App:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-green-400 bg-gray-900 px-3 py-2 rounded text-sm font-mono">
                  gh workflow run "Azure Static Web Apps CI/CD (Backup)"
                </code>
                <CopyButton text='gh workflow run "Azure Static Web Apps CI/CD (Backup)"' item="cmd-deploy" />
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-2">Create manual database backup:</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-green-400 bg-gray-900 px-3 py-2 rounded text-sm font-mono">
                  ./scripts/backup-database.sh
                </code>
                <CopyButton text="./scripts/backup-database.sh" item="cmd-db-backup" />
              </div>
            </div>
          </div>
        </div>

        {/* Disaster Recovery */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h2 className="font-semibold text-white">Disaster Recovery</h2>
          </div>
          <div className="p-4">
            <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4 mb-4">
              <h3 className="text-orange-400 font-medium mb-2">If Production Goes Down:</h3>
              <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                <li>Share backup URL with users: <code className="text-yellow-400">orange-forest-0960f250f.4.azurestaticapps.net</code></li>
                <li>Check Azure Portal for service status</li>
                <li>For database issues: Use Azure Point-in-Time Restore (up to 7 days)</li>
                <li>For code issues: Clone from backup repo and redeploy</li>
              </ol>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Database Restore</h4>
                <p className="text-sm text-gray-400 mb-2">Azure Portal &rarr; PostgreSQL &rarr; Restore</p>
                <p className="text-xs text-gray-500">Point-in-time restore available for 7 days</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Code Restore</h4>
                <p className="text-sm text-gray-400 mb-2">Clone backup repo and redeploy</p>
                <code className="text-xs text-green-400">git clone github.com/AzharM82/stockproai-backup</code>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Contacts */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-white">Emergency Contacts</h2>
          </div>
          <div className="divide-y divide-gray-700">
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Primary Admin</div>
                <div className="text-sm text-gray-400">Main point of contact</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-blue-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  reachazure37@gmail.com
                </code>
                <CopyButton text="reachazure37@gmail.com" item="email-primary" />
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-white font-medium">Secondary Admin</div>
                <div className="text-sm text-gray-400">Backup contact</div>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-blue-400 bg-gray-900 px-3 py-1 rounded text-sm">
                  reachazhar@hotmail.com
                </code>
                <CopyButton text="reachazhar@hotmail.com" item="email-secondary" />
              </div>
            </div>
          </div>
        </div>

        {/* App Metadata */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <Server className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-white">App Metadata</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">App Name</div>
                <div className="text-white font-medium">StockPro AI</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Version</div>
                <div className="text-white font-medium">1.0.0</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Environment</div>
                <div className="text-green-400 font-medium">Production</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">Region</div>
                <div className="text-white font-medium">East US 2</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Authentication</div>
                <div className="text-white">Google OAuth</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Payment</div>
                <div className="text-white">Stripe</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">AI Provider</div>
                <div className="text-white">Anthropic Claude</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Market Data</div>
                <div className="text-white">Polygon.io</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Database</div>
                <div className="text-white">PostgreSQL 16</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">Cache</div>
                <div className="text-white">Azure Redis</div>
              </div>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="text-center text-gray-500 text-sm pb-4">
          Last updated: January 2026
        </div>
      </div>
    </div>
  );
}
