import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  KeyRound,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { McpOAuthClient, McpToken, User } from '../types/models';
import { formatDateTime } from '../utils/formatters';

interface McpAccessSectionProps {
  currentUser: User;
}

type CopyFieldKey =
  | 'token'
  | 'config'
  | 'oauth_url'
  | 'oauth_client_id'
  | 'oauth_client_secret'
  | `client_${number}`;

export const McpAccessSection: React.FC<McpAccessSectionProps> = ({ currentUser }) => {
  const isSuperadmin = currentUser.role === 'superadmin';

  // Personal MCP Bearer Tokens state
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newRawToken, setNewRawToken] = useState<string | null>(null);

  // OAuth 2.1 Clients state (Superadmin)
  const [oauthClients, setOauthClients] = useState<McpOAuthClient[]>([]);
  const [oauthLoading, setOauthLoading] = useState(isSuperadmin);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthAppName, setOauthAppName] = useState('');
  const [oauthRedirectUri, setOauthRedirectUri] = useState('');
  const [oauthCreating, setOauthCreating] = useState(false);
  const [serverMcpUrl, setServerMcpUrl] = useState<string | null>(null);
  const [createdOAuthCreds, setCreatedOAuthCreds] = useState<{
    name: string;
    mcpServerUrl: string;
    clientId: string;
    clientSecret: string;
  } | null>(null);

  const [copiedKey, setCopiedKey] = useState<CopyFieldKey | null>(null);

  const mcpEndpointUrl =
    serverMcpUrl ||
    (typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp');

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tokens: list } = await api.listMcpTokens();
      setTokens(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load MCP access tokens.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOAuthClients = useCallback(async () => {
    if (!isSuperadmin) return;
    setOauthLoading(true);
    setOauthError(null);
    try {
      const res = await api.listOAuthClients();
      setOauthClients(res.clients);
      if (res.mcpServerUrl) {
        setServerMcpUrl(res.mcpServerUrl);
      }
    } catch (err) {
      setOauthError(err instanceof ApiError ? err.message : 'Unable to load OAuth clients.');
    } finally {
      setOauthLoading(false);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    void loadTokens();
    if (isSuperadmin) {
      void loadOAuthClients();
    }
  }, [loadTokens, loadOAuthClients, isSuperadmin]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await api.createMcpToken(label.trim() || 'Cursor / Claude Desktop');
      setNewRawToken(res.rawToken);
      setLabel('');
      await loadTokens();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to generate MCP token.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setError(null);
    try {
      await api.revokeMcpToken(id);
      await loadTokens();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to revoke MCP token.');
    }
  };

  const handleCreateOAuthClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setOauthError(null);
    if (!oauthAppName.trim() || !oauthRedirectUri.trim()) {
      setOauthError('Enter both an App Label and the Redirect URI.');
      return;
    }
    setOauthCreating(true);
    try {
      const res = await api.createOAuthClient({
        name: oauthAppName.trim(),
        redirect_uri: oauthRedirectUri.trim(),
      });
      setCreatedOAuthCreds({
        name: res.client.name,
        mcpServerUrl: res.mcpServerUrl,
        clientId: res.client.client_id,
        clientSecret: res.clientSecret,
      });
      setOauthAppName('');
      setOauthRedirectUri('');
      await loadOAuthClients();
    } catch (err) {
      setOauthError(err instanceof ApiError ? err.message : 'Unable to create OAuth app.');
    } finally {
      setOauthCreating(false);
    }
  };

  const handleRevokeOAuthClient = async (id: number) => {
    setOauthError(null);
    try {
      await api.revokeOAuthClient(id);
      await loadOAuthClients();
    } catch (err) {
      setOauthError(err instanceof ApiError ? err.message : 'Unable to revoke OAuth app.');
    }
  };

  const copyText = async (value: string, key: CopyFieldKey) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard blocked in restricted iframe; user can still select text manually
    }
  };

  const clientConfigJson = JSON.stringify(
    {
      mcpServers: {
        'growdeshit-os': {
          url: mcpEndpointUrl,
          headers: {
            Authorization: `Bearer ${newRawToken || '<YOUR_PERSONAL_MCP_TOKEN>'}`,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="space-y-6">
      {/* OAuth 2.1 Connected Apps (Gemini Web) — Superadmin Only */}
      {isSuperadmin && (
        <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <Globe className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  OAuth Apps (Gemini Web)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect GrowDeshIT OS directly in Gemini Web&apos;s Custom Connected Apps dialog using OAuth 2.1 with PKCE (S256).
                </p>
              </div>
            </div>
            <span className="font-mono-tabular text-xs text-teal-700 shrink-0">
              OAuth 2.1 · PKCE S256
            </span>
          </div>

          <div className="p-5 space-y-5">
            {oauthError && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700"
              >
                {oauthError}
              </div>
            )}

            {/* Create OAuth Client Form */}
            <form onSubmit={handleCreateOAuthClient} className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <label
                  htmlFor="oauth-app-label"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  App Label
                </label>
                <input
                  id="oauth-app-label"
                  type="text"
                  required
                  value={oauthAppName}
                  onChange={(e) => setOauthAppName(e.target.value)}
                  placeholder="Gemini Web"
                  className="w-full min-h-[42px] px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="md:col-span-5">
                <label
                  htmlFor="oauth-redirect-uri"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Redirect URI
                </label>
                <input
                  id="oauth-redirect-uri"
                  type="url"
                  required
                  value={oauthRedirectUri}
                  onChange={(e) => setOauthRedirectUri(e.target.value)}
                  placeholder="Paste URL from Gemini's Copy redirect URI"
                  className="w-full min-h-[42px] px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="md:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={oauthCreating}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{oauthCreating ? 'Creating...' : 'Create OAuth App'}</span>
                </button>
              </div>
            </form>

            {/* One-Time Generated Credentials Box */}
            {createdOAuthCreds && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <p className="text-xs font-semibold text-teal-900">
                    OAuth App &ldquo;{createdOAuthCreds.name}&rdquo; Created — Copy credentials now (Client Secret is shown once)
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-900/80">
                        MCP Server URL
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyText(createdOAuthCreds.mcpServerUrl, 'oauth_url')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 cursor-pointer"
                      >
                        {copiedKey === 'oauth_url' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono-tabular text-xs bg-white border border-teal-200 rounded-lg px-3 py-2 text-slate-900 break-all select-all">
                      {createdOAuthCreds.mcpServerUrl}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-900/80">
                        Client ID
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyText(createdOAuthCreds.clientId, 'oauth_client_id')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 cursor-pointer"
                      >
                        {copiedKey === 'oauth_client_id' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono-tabular text-xs bg-white border border-teal-200 rounded-lg px-3 py-2 text-slate-900 break-all select-all">
                      {createdOAuthCreds.clientId}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-900/80">
                        Client Secret
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void copyText(createdOAuthCreds.clientSecret, 'oauth_client_secret')
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 cursor-pointer"
                      >
                        {copiedKey === 'oauth_client_secret' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono-tabular text-xs bg-white border border-teal-200 rounded-lg px-3 py-2 text-slate-900 break-all select-all">
                      {createdOAuthCreds.clientSecret}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Registered OAuth Clients List */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                Registered OAuth Apps
              </h3>
              {oauthLoading ? (
                <div className="h-14 bg-slate-100 rounded-lg animate-pulse" />
              ) : oauthClients.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  No OAuth apps registered yet. Create one above using the Redirect URI from Gemini Web.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg">
                  {oauthClients.map((client) => {
                    const copyKey: CopyFieldKey = `client_${client.id}`;
                    return (
                      <div
                        key={client.id}
                        className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {client.name}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                client.is_active ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {client.is_active ? 'Active' : 'Revoked'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 font-mono-tabular">
                            <span className="break-all">{client.client_id}</span>
                            <button
                              type="button"
                              onClick={() => void copyText(client.client_id, copyKey)}
                              className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
                            >
                              {copiedKey === copyKey ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy ID</span>
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 break-all">
                            Redirect: {client.redirect_uris.join(', ')} · Created{' '}
                            {formatDateTime(client.created_at)}
                          </p>
                        </div>

                        {client.is_active && (
                          <button
                            type="button"
                            onClick={() => void handleRevokeOAuthClient(client.id)}
                            className="inline-flex items-center gap-1 self-start sm:self-center px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Existing Personal MCP Bearer Tokens Section (Cursor / Claude Desktop) */}
      <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Terminal className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                MCP Server Access (Personal Bearer Tokens)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect Claude Desktop, Cursor, or AI CLIs to manage projects, tasks, notes, schedules, and BDT reports under your{' '}
                <span className="font-medium text-slate-700 capitalize">{currentUser.role}</span> permissions.
              </p>
            </div>
          </div>
          <span className="font-mono-tabular text-xs text-teal-700 shrink-0">
            Endpoint: /api/mcp
          </span>
        </div>

        <div className="p-5 space-y-5">
          {/* Privacy Guarantee Notice */}
          <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3.5 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">Strict Customer Privacy Enforced:</strong> MCP tools never expose customer names, emails, phone numbers, companies, or CRM profiles. Projects only reference anonymized codes (e.g.,{' '}
              <code className="font-mono-tabular text-slate-800">CU-101</code>), and every MCP call is recorded in Activity Logs.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          {/* Generate New Token Form */}
          <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Token label (e.g., Cursor Laptop, Claude Desktop)"
              className="flex-1 min-h-[42px] px-3.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Generating...' : 'Generate MCP Token'}</span>
            </button>
          </form>

          {/* Newly Generated Token Reveal Banner (shown once) */}
          {newRawToken && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-900">
                  Personal MCP Bearer Token Generated — Copy now (shown only once)
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(newRawToken, 'token')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 cursor-pointer"
                >
                  {copiedKey === 'token' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Token</span>
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono-tabular text-xs bg-white border border-teal-200 rounded-lg px-3 py-2.5 text-slate-900 break-all select-all">
                {newRawToken}
              </div>
            </div>
          )}

          {/* Active & Revoked Tokens List */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
              Your Personal MCP Tokens
            </h3>
            {loading ? (
              <div className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ) : tokens.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No personal MCP tokens created yet. Generate one above to connect an external AI client.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg">
                {tokens.map((tok) => {
                  const isRevoked = Boolean(tok.revoked_at);
                  return (
                    <div
                      key={tok.id}
                      className="px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {tok.label}
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              isRevoked ? 'text-slate-400' : 'text-emerald-700'
                            }`}
                          >
                            {isRevoked ? 'Revoked' : 'Active'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                          {tok.token_prefix}•••• · Created {formatDateTime(tok.created_at)}
                          {tok.last_used_at ? ` · Last used ${formatDateTime(tok.last_used_at)}` : ''}
                        </p>
                      </div>

                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => void handleRevoke(tok.id)}
                          className="inline-flex items-center gap-1 self-start sm:self-center px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Client Configuration Snippet */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                MCP Client Configuration (Streamable HTTP)
              </h3>
              <button
                type="button"
                onClick={() => void copyText(clientConfigJson, 'config')}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
              >
                {copiedKey === 'config' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied JSON</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 rounded-lg p-3.5 text-xs font-mono-tabular overflow-x-auto leading-relaxed">
              {clientConfigJson}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
};
