import React, { useEffect, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { InvoiceDetail } from '../types/models';
import { formatCurrency, formatDate } from '../utils/formatters';

interface InvoiceModalProps {
  paymentId: number;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ paymentId, onClose }) => {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getInvoice(paymentId)
      .then((res) => {
        if (active) setInvoice(res.invoice);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Unable to load invoice.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paymentId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-sheet-title"
    >
      <div className="print-only-sheet w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden my-auto">
        {/* Top Action Strip (hidden on print) */}
        <div className="no-print flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-medium text-slate-600">Printable Client Invoice</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!invoice}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-lg bg-teal-700 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="p-8 sm:p-10">
          {loading ? (
            <div className="h-64 animate-pulse bg-slate-100 rounded-lg" />
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : invoice ? (
            <div className="space-y-8">
              {/* Brand & Invoice Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-6">
                <div>
                  <h2 id="invoice-sheet-title" className="font-display text-2xl font-bold text-slate-900">
                    {invoice.agency.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">{invoice.agency.tagline}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {invoice.agency.email} · {invoice.agency.website}
                  </p>
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-medium text-slate-500">INVOICE RECEIPT</p>
                  <p className="mt-1 font-mono-tabular text-xl font-bold text-slate-900">
                    {invoice.invoice_number}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
                    Date: {formatDate(invoice.payment_date)}
                  </p>
                </div>
              </div>

              {/* Client & Project Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Billed To</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{invoice.customer_name}</p>
                  {invoice.customer_company && (
                    <p className="text-slate-700">{invoice.customer_company}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
                    Client ID: {invoice.customer_code}
                  </p>
                  {invoice.customer_email && (
                    <p className="text-xs text-slate-600 mt-0.5">{invoice.customer_email}</p>
                  )}
                  {invoice.customer_phone && (
                    <p className="text-xs text-slate-600 font-mono-tabular">
                      {invoice.customer_phone}
                    </p>
                  )}
                </div>

                <div className="sm:text-right">
                  <p className="text-xs font-semibold text-slate-500">Project Reference</p>
                  <p className="mt-1.5 font-semibold text-slate-900">{invoice.project_title}</p>
                  <p className="text-xs text-slate-500 mt-1 font-mono-tabular">
                    Project ID: {invoice.project_code}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    Method: {invoice.payment_method}
                  </p>
                </div>
              </div>

              {/* Line Item Table */}
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-y border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3">Description</th>
                    <th className="py-3 text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  <tr>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-slate-900">{invoice.milestone_title}</p>
                      {invoice.notes && (
                        <p className="mt-1 text-xs text-slate-500">{invoice.notes}</p>
                      )}
                    </td>
                    <td className="py-4 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(invoice.payment_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Project Account Summary */}
              <div className="flex justify-end">
                <dl className="w-full sm:w-72 space-y-2 text-sm border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">This Payment</dt>
                    <dd className="font-mono-tabular font-semibold text-emerald-700">
                      {formatCurrency(invoice.payment_amount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Total Project Budget</dt>
                    <dd className="font-mono-tabular text-slate-900">
                      {formatCurrency(invoice.project_budget)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-600">Total Paid to Date</dt>
                    <dd className="font-mono-tabular text-slate-900">
                      {formatCurrency(invoice.project_paid_total)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
                    <dt className="font-semibold text-slate-900">Remaining Project Due</dt>
                    <dd
                      className={`font-mono-tabular text-base font-bold ${
                        invoice.project_due_total > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(invoice.project_due_total)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 flex items-center justify-between">
                <span>Thank you for partnering with {invoice.agency.name}.</span>
                <span className="font-mono-tabular">{invoice.invoice_number}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
