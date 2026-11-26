import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, ShieldCheck, Terminal, Trash2 } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { McpToken, User } from '../types/models';
import { formatDateTime } from '../utils/formatters';

interface McpAccessSectionProps {
  currentUser: User;
}

export const McpAccessSection: React.FC<McpAccessSectionProps> = ({ currentUser }) => {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newRawToken, setNewRawToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'token' | 'config' | null>(null);

  const mcpEndpointUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : '/api/mcp';

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

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

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

  const copyText = async (value: string, key: 'token' | 'config') => {
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
    <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Terminal className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              MCP Server Access (Model Context Protocol)
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
  );
};
