import React, { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type {
  PaymentWithMeta,
  ProjectSummary,
  Transaction,
  TransactionType,
  UserRole,
} from '../types/models';
import { formatCurrency, formatDate, todayISODate } from '../utils/formatters';

interface FinanceViewProps {
  userRole: UserRole;
  txModalOpen: boolean;
  onCloseTxModal: () => void;
  onOpenTxModal: () => void;
  onViewInvoice: (paymentId: number) => void;
  onDataChanged: () => void;
}

const EXPENSE_CATEGORIES = [
  'Hosting & Cloud',
  'Software & Tools',
  'Team & Payroll',
  'Marketing',
  'Office & Utilities',
  'General Expense',
];

const INCOME_CATEGORIES = [
  'Project Payment',
  'Retainer Fee',
  'Consulting',
  'Maintenance Plan',
  'Other Income',
];

export const FinanceView: React.FC<FinanceViewProps> = ({
  userRole,
  txModalOpen,
  onCloseTxModal,
  onOpenTxModal,
  onViewInvoice,
  onDataChanged,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'payments' | 'ledger'>('payments');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<PaymentWithMeta[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [txFilter, setTxFilter] = useState<'All' | TransactionType>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payProjectId, setPayProjectId] = useState('');
  const [payTitle, setPayTitle] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISODate());
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Transaction modal
  const [txType, setTxType] = useState<TransactionType>('Expense');
  const [txCategory, setTxCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(todayISODate());
  const [txDesc, setTxDesc] = useState('');
  const [txSaving, setTxSaving] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const loadFinanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, payRes, projRes] = await Promise.all([
        api.listTransactions({ type: txFilter }),
        api.listPayments(),
        api.listProjects(),
      ]);
      setTransactions(txRes.transactions);
      setPayments(payRes.payments);
      setProjects(projRes.projects);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load finance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFinanceData();
  }, [txFilter]);

  useEffect(() => {
    if (txModalOpen) {
      setTxType('Expense');
      setTxCategory(EXPENSE_CATEGORIES[0]);
      setTxAmount('');
      setTxDate(todayISODate());
      setTxDesc('');
      setTxError(null);
    }
  }, [txModalOpen]);

  const openPaymentModal = (presetProjectId?: number) => {
    const targetProject =
      projects.find((p) => p.id === presetProjectId) ||
      projects.find((p) => p.due_amount > 0) ||
      projects[0];
    setPayProjectId(targetProject ? String(targetProject.id) : '');
    setPayTitle('Milestone Payment');
    setPayAmount(targetProject && targetProject.due_amount > 0 ? String(targetProject.due_amount) : '');
    setPayDate(todayISODate());
    setPayMethod('Bank Transfer');
    setPayNotes('');
    setPayError(null);
    setPayModalOpen(true);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError(null);
    const amountNum = Number(txAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setTxError('Enter an amount greater than 0.');
      return;
    }
    setTxSaving(true);
    try {
      await api.createTransaction({
        type: txType,
        category: txCategory,
        amount: amountNum,
        transaction_date: txDate,
        description: txDesc.trim(),
      });
      onCloseTxModal();
      await loadFinanceData();
      onDataChanged();
    } catch (err) {
      setTxError(err instanceof ApiError ? err.message : 'Failed to save transaction.');
    } finally {
      setTxSaving(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    const projectIdNum = Number(payProjectId);
    const amountNum = Number(payAmount);
    if (!projectIdNum || !payTitle.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setPayError('Select a project, enter a milestone title, and provide a valid amount.');
      return;
    }
    setPaySaving(true);
    try {
      await api.recordPayment({
        project_id: projectIdNum,
        milestone_title: payTitle.trim(),
        amount: amountNum,
        payment_date: payDate,
        payment_method: payMethod,
        notes: payNotes.trim(),
      });
      setPayModalOpen(false);
      await loadFinanceData();
      onDataChanged();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Failed to record payment.');
    } finally {
      setPaySaving(false);
    }
  };

  const handleDeleteTransaction = async (id: number) => {
    try {
      await api.deleteTransaction(id);
      await loadFinanceData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete transaction.');
    }
  };

  const handleDeletePayment = async (id: number) => {
    try {
      await api.deletePayment(id);
      await loadFinanceData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete payment.');
    }
  };

  const totalBudgetAll = projects.reduce((s, p) => s + p.budget, 0);
  const totalPaidAll = projects.reduce((s, p) => s + p.paid_amount, 0);
  const totalDueAll = projects.reduce((s, p) => s + p.due_amount, 0);

  const visibleIncome = transactions
    .filter((t) => t.type === 'Income')
    .reduce((s, t) => s + t.amount, 0);
  const visibleExpense = transactions
    .filter((t) => t.type === 'Expense')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Segmented Finance Navigation + Secondary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Finance sections"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'payments'}
            onClick={() => setActiveSubTab('payments')}
            className={`min-h-[36px] px-3.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'payments'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payments & Milestones
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubTab === 'ledger'}
            onClick={() => setActiveSubTab('ledger')}
            className={`min-h-[36px] px-3.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSubTab === 'ledger'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Income & Expense Ledger
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openPaymentModal()}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeSubTab === 'payments' ? (
        <div className="space-y-6">
          {/* Project Billing Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200/90 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Contracted Project Budgets</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-slate-900">
                {formatCurrency(totalBudgetAll)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Total Collected Milestones</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-emerald-700">
                {formatCurrency(totalPaidAll)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Auto-Calculated Pending Dues</p>
              <p className="mt-1.5 font-mono-tabular text-2xl font-semibold text-amber-700">
                {formatCurrency(totalDueAll)}
              </p>
            </div>
          </div>

          {/* Project Milestone Balance Table */}
          <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Project Billing Balances</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Total Budget, Paid Amount, and auto-calculated Due Amount per active engagement
              </p>
            </div>

            {loading ? (
              <div className="p-6 h-32 animate-pulse bg-slate-50" />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                        <th className="py-3 pl-5 pr-3">Project</th>
                        <th className="py-3 px-3 text-right">Total Budget</th>
                        <th className="py-3 px-3 text-right">Paid Amount</th>
                        <th className="py-3 px-3 text-right">Due Amount</th>
                        <th className="py-3 pl-3 pr-5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {projects.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 pl-5 pr-3">
                            <p className="font-medium text-slate-900">{p.title}</p>
                            <p className="text-xs text-slate-500">
                              <span className="font-mono-tabular">{p.project_code}</span> ·{' '}
                              {p.customer_company || p.customer_name}
                            </p>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono-tabular text-slate-900">
                            {formatCurrency(p.budget)}
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono-tabular font-medium text-emerald-700">
                            {formatCurrency(p.paid_amount)}
                          </td>
                          <td
                            className={`py-3.5 px-3 text-right font-mono-tabular font-semibold ${
                              p.due_amount > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatCurrency(p.due_amount)}
                          </td>
                          <td className="py-3.5 pl-3 pr-5 text-right">
                            <button
                              type="button"
                              onClick={() => openPaymentModal(p.id)}
                              className="min-h-[34px] px-3 rounded-md text-xs font-medium text-teal-700 hover:bg-teal-50 whitespace-nowrap cursor-pointer"
                            >
                              + Add Payment
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-slate-100">
                  {projects.map((p) => (
                    <div key={p.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 font-mono-tabular">
                            {p.project_code} · {p.customer_company || p.customer_name}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">{p.title}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openPaymentModal(p.id)}
                          className="min-h-[36px] px-2.5 rounded-md text-xs font-medium text-teal-700 bg-teal-50 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          + Pay
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1 font-mono-tabular text-xs">
                        <div>
                          <p className="text-slate-500">Budget</p>
                          <p className="font-semibold text-slate-900">{formatCurrency(p.budget)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Paid</p>
                          <p className="font-semibold text-emerald-700">
                            {formatCurrency(p.paid_amount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500">Due</p>
                          <p
                            className={`font-semibold ${
                              p.due_amount > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatCurrency(p.due_amount)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Recorded Invoices & Receipts */}
          <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Payment Receipts & Printable Invoices
              </h2>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No milestone payments recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {payments.map((pm) => (
                  <div
                    key={pm.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono-tabular font-semibold text-slate-800">
                          {pm.invoice_number}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(pm.payment_date)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{pm.payment_method}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                        {pm.project_title} — {pm.milestone_title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {pm.customer_company || pm.customer_name} ({pm.project_code})
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                        +{formatCurrency(pm.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onViewInvoice(pm.id)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>View Invoice</span>
                      </button>
                      {userRole === 'superadmin' && (
                        <button
                          type="button"
                          onClick={() => void handleDeletePayment(pm.id)}
                          aria-label={`Delete payment ${pm.invoice_number}`}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* Income & Expense Ledger Tab */
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['All', 'Income', 'Expense'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTxFilter(type)}
                  className={`min-h-[34px] px-3 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    txFilter === type
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 text-xs font-mono-tabular">
              <span className="text-emerald-700 font-medium">
                Income {formatCurrency(visibleIncome)}
              </span>
              <span aria-hidden="true" className="text-slate-300">/</span>
              <span className="text-red-700 font-medium">
                Expenses {formatCurrency(visibleExpense)}
              </span>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No ledger transactions recorded for this filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`font-medium ${
                            tx.type === 'Income' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{tx.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{formatDate(tx.transaction_date)}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-slate-900 truncate">
                        {tx.description || tx.category}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`font-mono-tabular text-sm font-semibold ${
                          tx.type === 'Income' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {tx.type === 'Income' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </span>
                      {userRole === 'superadmin' && !tx.payment_id && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteTransaction(tx.id)}
                          aria-label={`Delete transaction ${tx.description || tx.category}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Log Income / Expense Modal */}
      {txModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tx-modal-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 id="tx-modal-title" className="font-display text-lg font-bold text-slate-900">
                Log Income or Expense
              </h3>
              <button
                type="button"
                onClick={onCloseTxModal}
                aria-label="Close transaction modal"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {txError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {txError}
              </div>
            )}

            <form onSubmit={handleSaveTransaction} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['Expense', 'Income'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTxType(t);
                      setTxCategory(t === 'Expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
                    }}
                    className={`min-h-[36px] text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      txType === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div>
                <label htmlFor="tx-category" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Category *
                </label>
                <select
                  id="tx-category"
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  {(txType === 'Expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Amount (BDT) *
                  </label>
                  <input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="15000"
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="tx-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Date *
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tx-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Description
                </label>
                <input
                  id="tx-desc"
                  type="text"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="e.g. Monthly cloud server billing"
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCloseTxModal}
                  className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={txSaving}
                  className="min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {txSaving ? 'Saving...' : `Save ${txType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Project Milestone Payment Modal */}
      {payModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fin-pay-modal-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 id="fin-pay-modal-title" className="font-display text-lg font-bold text-slate-900">
                Record Project Payment
              </h3>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                aria-label="Close payment modal"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {payError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {payError}
              </div>
            )}

            <form onSubmit={handleSavePayment} className="mt-4 space-y-4">
              <div>
                <label htmlFor="fp-project" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Project *
                </label>
                <select
                  id="fp-project"
                  required
                  value={payProjectId}
                  onChange={(e) => setPayProjectId(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} — {p.title} (Due {formatCurrency(p.due_amount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="fp-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Milestone Title *
                </label>
                <input
                  id="fp-title"
                  type="text"
                  required
                  value={payTitle}
                  onChange={(e) => setPayTitle(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fp-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Amount (BDT) *
                  </label>
                  <input
                    id="fp-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm font-mono-tabular"
                  />
                </div>
                <div>
                  <label htmlFor="fp-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Date
                  </label>
                  <input
                    id="fp-date"
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="fp-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Payment Method
                </label>
                <select
                  id="fp-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Wire Transfer">Wire Transfer</option>
                  <option value="bKash / MFS">bKash / MFS</option>
                  <option value="Stripe / Card">Stripe / Card</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>

              <div>
                <label htmlFor="fp-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Notes
                </label>
                <input
                  id="fp-notes"
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional reference or bank receipt ID"
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paySaving}
                  className="min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {paySaving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
