import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Search, Terminal } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { ActivityLog } from '../types/models';
import { formatDateTime } from '../utils/formatters';

export const ActivityLogsView: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [scope, setScope] = useState<'all' | 'personal'>('personal');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'All' | 'Web' | 'MCP'>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAuditLogs({
        search: search.trim() || undefined,
        source: sourceFilter === 'All' ? undefined : sourceFilter,
        limit: 120,
      });
      setLogs(data.logs);
      setScope(data.scope);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load activity logs.');
    } finally {
      setLoading(false);
    }
  }, [search, sourceFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLogs();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  return (
    <div className="space-y-5">
      {/* Header & Filter Controls */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by user, action, project code, or details..."
            className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-600"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {(['All', 'Web', 'MCP'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`min-h-[34px] px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  sourceFilter === src
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {src}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 hidden md:inline">
            Scope:{' '}
            <strong className="font-semibold text-slate-700">
              {scope === 'all' ? 'All Agency' : 'Personal'}
            </strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-white border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Timeline List */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Audit Trail ({logs.length})
          </h2>
          <span className="text-xs text-slate-500">
            {scope === 'all'
              ? 'Showing all Web & MCP team actions'
              : 'Showing your personal Web & MCP activity'}
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No matching activity logs found.
          </div>
        ) : (
          <ol className="divide-y divide-slate-100">
            {logs.map((entry) => {
              const isMcp = entry.source === 'MCP';
              return (
                <li key={entry.id} className="px-4 sm:px-5 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isMcp
                          ? 'bg-slate-900 border-slate-800 text-teal-300'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {isMcp ? (
                        <Terminal className="w-4 h-4" />
                      ) : (
                        <Globe className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                          <span className="text-sm font-semibold text-slate-900">
                            {entry.user_name}
                          </span>
                          <span className="text-xs text-slate-400 capitalize">
                            ({entry.user_role})
                          </span>
                          <span className="font-mono-tabular text-xs font-medium text-teal-700">
                            {entry.action}
                          </span>
                        </div>
                        <time className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                          {formatDateTime(entry.created_at)}
                        </time>
                      </div>

                      <p className="text-sm text-slate-700 mt-1 break-words">{entry.details}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        <span>
                          Target:{' '}
                          <span className="font-mono-tabular font-medium text-slate-700">
                            {entry.entity_type} · {entry.entity_id}
                          </span>
                        </span>
                        <span
                          className={`font-mono-tabular font-semibold ${
                            isMcp ? 'text-teal-700' : 'text-slate-600'
                          }`}
                        >
                          Source: {entry.source}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
