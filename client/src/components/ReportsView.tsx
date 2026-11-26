import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, Printer, RotateCcw } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { FinancialReport } from '../types/models';
import {
  formatCompactBdt,
  formatCurrency,
  formatDate,
  getProjectStatusTone,
} from '../utils/formatters';

interface ReportsViewProps {
  onOpenProject: (projectId: number) => void;
}

const STATUS_BAR_COLORS: Record<string, string> = {
  Pending: '#64748b',
  'In Progress': '#0f766e',
  Review: '#d97706',
  Completed: '#059669',
};

export const ReportsView: React.FC<ReportsViewProps> = ({ onOpenProject }) => {
  const [filterMode, setFilterMode] = useState<'all' | 'month' | 'range'>('all');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { month?: string; startDate?: string; endDate?: string } = {};
      if (filterMode === 'month' && month) {
        params.month = month;
      } else if (filterMode === 'range') {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }
      const data = await api.getReports(params);
      setReport(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load financial reports.');
    } finally {
      setLoading(false);
    }
  }, [filterMode, month, startDate, endDate]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleResetFilters = () => {
    setFilterMode('all');
    setStartDate('');
    setEndDate('');
  };

  const activePeriodLabel =
    filterMode === 'month' && month
      ? `Month: ${month}`
      : filterMode === 'range' && (startDate || endDate)
        ? `${startDate ? formatDate(startDate) : 'Start'} — ${endDate ? formatDate(endDate) : 'Today'}`
        : 'All-Time Agency Ledger';

  return (
    <div className="space-y-6">
      {/* Filter & Export Bar */}
      <div className="no-print bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {(
              [
                { id: 'all', label: 'All Time' },
                { id: 'month', label: 'Monthly' },
                { id: 'range', label: 'Date Range' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`min-h-[34px] px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filterMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {filterMode === 'month' && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="month"
                aria-label="Filter report by month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:border-teal-600"
              />
            </div>
          )}

          {filterMode === 'range' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:border-teal-600"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                aria-label="End date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 text-xs sm:text-sm text-slate-900 bg-white focus:outline-none focus:border-teal-600"
              />
            </div>
          )}

          {filterMode !== 'all' && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 min-h-[38px] px-3 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 min-h-[40px] px-4 rounded-lg bg-slate-900 text-xs sm:text-sm font-medium text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Export Report</span>
        </button>
      </div>

      {error && (
        <div className="bg-white border border-rose-200 rounded-xl p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
              <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-28 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="print-only-sheet space-y-6">
          {/* Print Header */}
          <div className="hidden print:flex items-start justify-between border-b border-slate-200 pb-4 mb-4">
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900">
                GrowDeshIT OS — Financial &amp; Project Report
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Period: {activePeriodLabel} · Currency: BDT (৳)
              </p>
            </div>
            <p className="text-xs text-slate-500 font-mono-tabular">
              Generated {formatDate(new Date().toISOString().slice(0, 10))}
            </p>
          </div>

          {/* Summary KPI Row */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Total Income
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-emerald-700 mt-2 break-words">
                {formatCurrency(report.summary.totalIncome)}
              </p>
              <p className="text-xs text-slate-500 mt-1">{activePeriodLabel}</p>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Total Expenses
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-rose-700 mt-2 break-words">
                {formatCurrency(report.summary.totalExpenses)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {report.expenseByCategory.length} expense categories
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Net Profit
              </p>
              <p
                className={`font-mono-tabular text-xl sm:text-2xl font-bold mt-2 break-words ${
                  report.summary.netProfit >= 0 ? 'text-teal-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(report.summary.netProfit)}
              </p>
              <p className="text-xs text-slate-500 mt-1">Income minus expenses</p>
            </div>

            <div className="bg-white border border-slate-200/90 rounded-xl p-4 sm:p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Pending Dues
              </p>
              <p className="font-mono-tabular text-xl sm:text-2xl font-bold text-amber-700 mt-2 break-words">
                {formatCurrency(report.summary.pendingDues)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {report.summary.activeProjects} active · {report.summary.completedProjects} completed
              </p>
            </div>
          </section>

          {/* Charts Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Income vs Expense Monthly Chart */}
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900">
                    Income vs. Expenses (BDT)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Monthly cashflow comparison across selected period
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-teal-700" />
                    Income
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                    Expenses
                  </span>
                </div>
              </div>

              {report.monthlyCashflow.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center text-sm text-slate-500">
                  No transactions recorded in this date range.
                </div>
              ) : (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.monthlyCashflow}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(val: number) => formatCompactBdt(val)}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        width={64}
                      />
                      <Tooltip
                        formatter={(value: unknown) => formatCurrency(Number(value) || 0)}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="income" name="Income" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Project Status Breakdown */}
            <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Project Status Breakdown
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Distribution across {report.summary.totalProjects} projects ({formatCurrency(report.summary.totalBudget)} total value)
                </p>

                <div className="h-[180px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={report.projectStatusBreakdown}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={82}
                        tick={{ fontSize: 11, fill: '#334155' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value: unknown) => [`${value} project(s)`, 'Count']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                        {report.projectStatusBreakdown.map((entry) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_BAR_COLORS[entry.status] || '#0f766e'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-3 border-t border-slate-100 mt-3">
                {report.projectStatusBreakdown.map((item) => (
                  <div key={item.status} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{item.status}</span>
                    <span className="font-mono-tabular font-medium text-slate-900">
                      {item.count} · {formatCompactBdt(item.budget)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Pending & Top Project Balances */}
          <section className="bg-white border border-slate-200/90 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Project Financial Balances
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sorted by highest outstanding dues first
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-slate-600">
                Collected {formatCurrency(report.summary.totalCollected)} /{' '}
                {formatCurrency(report.summary.totalBudget)}
              </span>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-5">Project</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Budget</th>
                    <th className="py-3 px-4 text-right">Paid</th>
                    <th className="py-3 px-5 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {report.pendingBalances.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => onOpenProject(row.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-5">
                        <span className="font-mono-tabular text-xs font-semibold text-teal-700 mr-2">
                          {row.project_code}
                        </span>
                        <span className="font-medium text-slate-900">{row.title}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {row.customer_company || row.customer_name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-xs font-semibold ${getProjectStatusTone(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-700">
                        {formatCurrency(row.budget)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular text-emerald-700">
                        {formatCurrency(row.paid_amount)}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono-tabular font-semibold text-amber-700">
                        {formatCurrency(row.due_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {report.pendingBalances.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onOpenProject(row.id)}
                  className="w-full text-left p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular text-xs font-semibold text-teal-700">
                      {row.project_code}
                    </span>
                    <span className={`text-xs font-semibold ${getProjectStatusTone(row.status)}`}>
                      {row.status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{row.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {row.customer_company || row.customer_name}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Budget</span>
                      <span className="font-mono-tabular font-medium text-slate-800">
                        {formatCurrency(row.budget)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Paid</span>
                      <span className="font-mono-tabular font-medium text-emerald-700">
                        {formatCurrency(row.paid_amount)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block">Due</span>
                      <span className="font-mono-tabular font-semibold text-amber-700">
                        {formatCurrency(row.due_amount)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
