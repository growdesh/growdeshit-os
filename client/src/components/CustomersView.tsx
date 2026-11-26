import React, { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { Customer, CustomerDetail, CustomerStatus, UserRole } from '../types/models';
import {
  formatCurrency,
  getCustomerStatusTone,
  getProjectStatusTone,
} from '../utils/formatters';

interface CustomersViewProps {
  userRole: UserRole;
  createModalOpen: boolean;
  onCloseCreateModal: () => void;
  onOpenCreateModal: () => void;
  onOpenProject: (projectId: number) => void;
  onCreateProjectForCustomer: (customerId: number) => void;
  onDataChanged: () => void;
}

const STATUS_OPTIONS: Array<'All' | CustomerStatus> = ['All', 'Active', 'Lead', 'Inactive'];

export const CustomersView: React.FC<CustomersViewProps> = ({
  userRole,
  createModalOpen,
  onCloseCreateModal,
  onOpenCreateModal,
  onOpenProject,
  onCreateProjectForCustomer,
  onDataChanged,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | CustomerStatus>('All');

  // Selected Customer Profile
  const [selectedDetail, setSelectedDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add / Edit Modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState<CustomerStatus>('Active');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isModalVisible = createModalOpen || editingCustomer !== null;

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listCustomers({ search, status: statusFilter });
      setCustomers(res.customers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, [statusFilter, search]);

  useEffect(() => {
    if (createModalOpen && !editingCustomer) {
      setFormName('');
      setFormCompany('');
      setFormPhone('');
      setFormEmail('');
      setFormStatus('Active');
      setFormNotes('');
      setFormError(null);
    }
  }, [createModalOpen, editingCustomer]);

  const openProfile = async (customerId: number) => {
    setDetailLoading(true);
    try {
      const res = await api.getCustomer(customerId);
      setSelectedDetail(res.customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load customer profile.');
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormCompany(customer.company);
    setFormPhone(customer.phone);
    setFormEmail(customer.email);
    setFormStatus(customer.status);
    setFormNotes(customer.notes);
    setFormError(null);
  };

  const closeModal = () => {
    setEditingCustomer(null);
    onCloseCreateModal();
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    setSaving(true);
    try {
      if (editingCustomer) {
        const res = await api.updateCustomer(editingCustomer.id, {
          name: formName.trim(),
          company: formCompany.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          status: formStatus,
          notes: formNotes.trim(),
        });
        if (selectedDetail && selectedDetail.id === editingCustomer.id) {
          setSelectedDetail({ ...selectedDetail, ...res.customer });
        }
      } else {
        await api.createCustomer({
          name: formName.trim(),
          company: formCompany.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim(),
          status: formStatus,
          notes: formNotes.trim(),
        });
      }
      closeModal();
      await fetchCustomers();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    try {
      await api.deleteCustomer(customer.id);
      if (selectedDetail?.id === customer.id) {
        setSelectedDetail(null);
      }
      await fetchCustomers();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete customer.');
    }
  };

  // Profile View
  if (selectedDetail) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedDetail(null)}
            className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to Customers</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEdit(selectedDetail)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              onClick={() => onCreateProjectForCustomer(selectedDetail.id)}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Profile Overview Card */}
        <section className="rounded-xl border border-slate-200/90 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono-tabular font-semibold text-slate-700">
                  {selectedDetail.customer_code}
                </span>
                <span aria-hidden="true">·</span>
                <span className={`font-medium ${getCustomerStatusTone(selectedDetail.status)}`}>
                  {selectedDetail.status}
                </span>
              </div>
              <h2 className="mt-1.5 font-display text-2xl font-bold text-slate-900">
                {selectedDetail.name}
              </h2>
              {selectedDetail.company && (
                <p className="text-sm text-slate-600 mt-0.5">{selectedDetail.company}</p>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{selectedDetail.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {selectedDetail.phone || '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500">General Notes</h3>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {selectedDetail.notes || 'No general notes recorded for this customer yet.'}
            </p>
          </div>
        </section>

        {/* Linked Projects */}
        <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Linked Projects ({selectedDetail.projects.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Click any project to manage tasks, categorized notes, and milestone payments
              </p>
            </div>
          </div>

          {selectedDetail.projects.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600">No projects linked to this customer yet.</p>
              <button
                type="button"
                onClick={() => onCreateProjectForCustomer(selectedDetail.id)}
                className="mt-3 min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
              >
                Create Project for {selectedDetail.name}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {selectedDetail.projects.map((proj) => (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => onOpenProject(proj.id)}
                  className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-slate-700">
                        {proj.project_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-medium ${getProjectStatusTone(proj.status)}`}>
                        {proj.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{proj.title}</p>
                  </div>
                  <div className="flex items-center gap-6 font-mono-tabular text-xs sm:text-sm">
                    <div className="text-right">
                      <p className="text-slate-500 text-xs">Budget</p>
                      <p className="font-semibold text-slate-900">{formatCurrency(proj.budget)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-xs">Paid</p>
                      <p className="font-semibold text-emerald-700">
                        {formatCurrency(proj.paid_amount)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-xs">Due</p>
                      <p className="font-semibold text-amber-700">
                        {formatCurrency(proj.due_amount)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {isModalVisible && (
          <CustomerModal
            isEdit={Boolean(editingCustomer)}
            name={formName}
            company={formCompany}
            phone={formPhone}
            email={formEmail}
            status={formStatus}
            notes={formNotes}
            error={formError}
            saving={saving}
            onChangeName={setFormName}
            onChangeCompany={setFormCompany}
            onChangePhone={setFormPhone}
            onChangeEmail={setFormEmail}
            onChangeStatus={setFormStatus}
            onChangeNotes={setFormNotes}
            onClose={closeModal}
            onSubmit={handleSave}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, CU ID, email, or phone..."
            aria-label="Search customers"
            className="w-full min-h-[42px] rounded-lg border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          {STATUS_OPTIONS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[34px] px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Customers Directory */}
      <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No customers match your filter</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a new agency client to automatically assign their unique Customer ID.
            </p>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="mt-4 min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              Add First Customer
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-5 pr-3">ID</th>
                    <th className="py-3 px-3">Customer & Company</th>
                    <th className="py-3 px-3">Contact</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Projects</th>
                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 pl-5 pr-3 font-mono-tabular text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {c.customer_code}
                      </td>
                      <td className="py-3.5 px-3">
                        <button
                          type="button"
                          onClick={() => void openProfile(c.id)}
                          className="text-left group cursor-pointer"
                        >
                          <p className="font-medium text-slate-900 group-hover:text-teal-700 transition-colors">
                            {c.name}
                          </p>
                          <p className="text-xs text-slate-500">{c.company || 'Individual'}</p>
                        </button>
                      </td>
                      <td className="py-3.5 px-3">
                        <p className="text-xs text-slate-700">{c.email || '—'}</p>
                        <p className="font-mono-tabular text-xs text-slate-500">{c.phone || '—'}</p>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`text-xs font-medium ${getCustomerStatusTone(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular text-xs text-slate-700">
                        {c.project_count ?? 0}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void openProfile(c.id)}
                            className="min-h-[34px] px-2.5 rounded-md text-xs font-medium text-teal-700 hover:bg-teal-50 cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={`Edit ${c.name}`}
                            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {userRole === 'superadmin' && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(c)}
                              aria-label={`Delete ${c.name}`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Stacked Rows */}
            <div className="md:hidden divide-y divide-slate-100">
              {customers.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => void openProfile(c.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-semibold text-slate-700">
                        {c.customer_code}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-medium ${getCustomerStatusTone(c.status)}`}>
                        {c.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{c.project_count ?? 0} projects</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {c.company || c.email || c.phone || 'No company listed'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    aria-label={`Edit ${c.name}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {detailLoading && (
        <p className="text-xs text-slate-500">Loading customer profile...</p>
      )}

      {isModalVisible && (
        <CustomerModal
          isEdit={Boolean(editingCustomer)}
          name={formName}
          company={formCompany}
          phone={formPhone}
          email={formEmail}
          status={formStatus}
          notes={formNotes}
          error={formError}
          saving={saving}
          onChangeName={setFormName}
          onChangeCompany={setFormCompany}
          onChangePhone={setFormPhone}
          onChangeEmail={setFormEmail}
          onChangeStatus={setFormStatus}
          onChangeNotes={setFormNotes}
          onClose={closeModal}
          onSubmit={handleSave}
        />
      )}
    </div>
  );
};

interface CustomerModalProps {
  isEdit: boolean;
  name: string;
  company: string;
  phone: string;
  email: string;
  status: CustomerStatus;
  notes: string;
  error: string | null;
  saving: boolean;
  onChangeName: (v: string) => void;
  onChangeCompany: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeEmail: (v: string) => void;
  onChangeStatus: (v: CustomerStatus) => void;
  onChangeNotes: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CustomerModal: React.FC<CustomerModalProps> = ({
  isEdit,
  name,
  company,
  phone,
  email,
  status,
  notes,
  error,
  saving,
  onChangeName,
  onChangeCompany,
  onChangePhone,
  onChangeEmail,
  onChangeStatus,
  onChangeNotes,
  onClose,
  onSubmit,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="customer-modal-title"
  >
    <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h3 id="customer-modal-title" className="font-display text-lg font-bold text-slate-900">
          {isEdit ? 'Edit Customer' : 'Add Customer'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close customer modal"
          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cust-name" className="block text-xs font-medium text-slate-700 mb-1.5">
              Contact Name *
            </label>
            <input
              id="cust-name"
              type="text"
              required
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="e.g. Tariq Rahman"
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
          <div>
            <label htmlFor="cust-company" className="block text-xs font-medium text-slate-700 mb-1.5">
              Company
            </label>
            <input
              id="cust-company"
              type="text"
              value={company}
              onChange={(e) => onChangeCompany(e.target.value)}
              placeholder="e.g. Bengal Craft"
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cust-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
              Phone
            </label>
            <input
              id="cust-phone"
              type="tel"
              value={phone}
              onChange={(e) => onChangePhone(e.target.value)}
              placeholder="+880 1711-000000"
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
          <div>
            <label htmlFor="cust-email" className="block text-xs font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="cust-email"
              type="email"
              value={email}
              onChange={(e) => onChangeEmail(e.target.value)}
              placeholder="client@company.com"
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cust-status" className="block text-xs font-medium text-slate-700 mb-1.5">
            Status
          </label>
          <select
            id="cust-status"
            value={status}
            onChange={(e) => onChangeStatus(e.target.value as CustomerStatus)}
            className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          >
            <option value="Active">Active</option>
            <option value="Lead">Lead</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div>
          <label htmlFor="cust-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
            General Notes
          </label>
          <textarea
            id="cust-notes"
            rows={3}
            value={notes}
            onChange={(e) => onChangeNotes(e.target.value)}
            placeholder="Key preferences, billing terms, or communication cadence..."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  </div>
);
