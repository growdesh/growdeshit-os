import React from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import type { DashboardOverview } from '../types/models';
import { formatCurrency, formatDate, getProjectStatusTone } from '../utils/formatters';

interface DashboardViewProps {
  data: DashboardOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenProject: (projectId: number) => void;
  onViewInvoice: (paymentId: number) => void;
  onNavigateTab: (tab: 'customers' | 'projects' | 'finance') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  error,
  onRetry,
  onOpenProject,
  onViewInvoice,
  onNavigateTab,
}) => {
  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white p-4 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
          <div className="lg:col-span-5 h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Unable to load dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 min-h-[40px] rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { kpis, recentProjects, recentPayments } = data;

  const kpiItems = [
    {
      label: 'Total Customers',
      value: String(kpis.totalCustomers),
      subtext: 'CRM accounts',
      tone: 'text-slate-900',
      action: () => onNavigateTab('customers'),
    },
    {
      label: 'Active Projects',
      value: String(kpis.activeProjects),
      subtext: 'In pipeline or review',
      tone: 'text-slate-900',
      action: () => onNavigateTab('projects'),
    },
    {
      label: 'Total Income',
      value: formatCurrency(kpis.totalIncome),
      subtext: `Net ${formatCurrency(kpis.netBalance)}`,
      tone: 'text-emerald-700',
      action: () => onNavigateTab('finance'),
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(kpis.totalExpenses),
      subtext: 'Operating ledger',
      tone: 'text-slate-900',
      action: () => onNavigateTab('finance'),
    },
    {
      label: 'Pending Dues',
      value: formatCurrency(kpis.pendingDues),
      subtext: 'Unpaid project balance',
      tone: kpis.pendingDues > 0 ? 'text-amber-700' : 'text-emerald-700',
      action: () => onNavigateTab('finance'),
    },
  ];

  return (
    <div className="space-y-8">
      {/* 5-KPI Executive Strip */}
      <section aria-label="Agency summary metrics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {kpiItems.map((item, idx) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className={`text-left rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5 hover:border-slate-300 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                idx === 4 ? 'col-span-2 sm:col-span-1' : ''
              }`}
            >
              <p className="text-xs font-medium text-slate-500">{item.label}</p>
              <p className={`mt-2 font-mono-tabular text-xl sm:text-2xl font-semibold tracking-tight ${item.tone}`}>
                {item.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 truncate">{item.subtext}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Two-Column Activity Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Projects */}
        <section
          aria-labelledby="recent-projects-heading"
          className="lg:col-span-7 rounded-xl border border-slate-200/90 bg-white overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <h2 id="recent-projects-heading" className="text-base font-semibold text-slate-900">
                Recent Projects
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Delivery progress and remaining client balance
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('projects')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>All projects</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {recentProjects.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">No projects created yet.</p>
              <button
                type="button"
                onClick={() => onNavigateTab('projects')}
                className="mt-3 min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
              >
                Create First Project
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onOpenProject(project.id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50/90 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-medium text-slate-700">
                        {project.project_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">
                        {project.customer_company || project.customer_name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-medium ${getProjectStatusTone(project.status)}`}>
                        {project.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900 truncate">
                      {project.title}
                    </p>
                  </div>

                  <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1 shrink-0">
                    <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                      {formatCurrency(project.budget)}
                    </span>
                    <span className="font-mono-tabular text-xs text-slate-500">
                      Due {formatCurrency(project.due_amount)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Recent Payments */}
        <section
          aria-labelledby="recent-payments-heading"
          className="lg:col-span-5 rounded-xl border border-slate-200/90 bg-white overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
            <div>
              <h2 id="recent-payments-heading" className="text-base font-semibold text-slate-900">
                Recent Payments
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cleared client milestones with printable receipts
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('finance')}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Finance ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {recentPayments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-medium text-slate-700">
                        {payment.invoice_number}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(payment.payment_date)}</span>
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                      {payment.customer_company || payment.customer_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{payment.milestone_title}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                      +{formatCurrency(payment.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onViewInvoice(payment.id)}
                      aria-label={`View invoice ${payment.invoice_number}`}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
