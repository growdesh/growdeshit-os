import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { User, UserRole } from '../types/models';
import { formatDate } from '../utils/formatters';
import { McpAccessSection } from './McpAccessSection';

interface TeamViewProps {
  currentUser: User;
  addModalOpen: boolean;
  onCloseAddModal: () => void;
}

export const TeamView: React.FC<TeamViewProps> = ({
  currentUser,
  addModalOpen,
  onCloseAddModal,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers();
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    if (addModalOpen) {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('employee');
      setFormError(null);
    }
  }, [addModalOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !email.trim() || !phone.trim() || password.length < 6) {
      setFormError('Complete all fields with a password of at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.createUser({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      onCloseAddModal();
      await loadUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create team member.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (target: User) => {
    try {
      await api.deleteUser(target.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to remove team member.');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Agency Team Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-based access control: Superadmins manage accounts and deletions; Employees manage
            clients, projects, tasks, notes, and ledger entries.
          </p>
        </div>

        {loading ? (
          <div className="p-6 h-32 animate-pulse bg-slate-50" />
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((member) => (
              <div
                key={member.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span
                      className={`font-medium ${
                        member.role === 'superadmin' ? 'text-teal-700' : 'text-slate-600'
                      }`}
                    >
                      {member.role === 'superadmin' ? 'Superadmin' : 'Employee'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Joined {formatDate(member.created_at)}</span>
                    {member.id === currentUser.id && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-700 font-medium">You</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-500">
                    {member.email} · <span className="font-mono-tabular">{member.phone}</span>
                  </p>
                </div>

                {currentUser.role === 'superadmin' && member.id !== currentUser.id && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(member)}
                    aria-label={`Remove ${member.name}`}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700 self-start sm:self-auto cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <McpAccessSection currentUser={currentUser} />

      {addModalOpen && currentUser.role === 'superadmin' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-member-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 id="add-member-title" className="font-display text-lg font-bold text-slate-900">
                Add Team Member
              </h3>
              <button
                type="button"
                onClick={onCloseAddModal}
                aria-label="Close add team member modal"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label htmlFor="tm-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <input
                  id="tm-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="tm-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Work Email *
                </label>
                <input
                  id="tm-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="tm-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Phone Number *
                </label>
                <input
                  id="tm-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="tm-role" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Role
                  </label>
                  <select
                    id="tm-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="employee">Employee</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="tm-pass" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Password *
                  </label>
                  <input
                    id="tm-pass"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCloseAddModal}
                  className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
