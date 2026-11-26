import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  FileText,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import type {
  Customer,
  NoteCategory,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  UserRole,
} from '../types/models';
import {
  formatCurrency,
  formatDate,
  getProjectStatusTone,
  todayISODate,
} from '../utils/formatters';

interface ProjectsViewProps {
  userRole: UserRole;
  selectedProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  createModalOpen: boolean;
  prefillCustomerId: number | null;
  onCloseCreateModal: () => void;
  onOpenCreateModal: () => void;
  onViewInvoice: (paymentId: number) => void;
  onDataChanged: () => void;
}

const STATUS_TABS: Array<'All' | ProjectStatus> = [
  'All',
  'Pending',
  'In Progress',
  'Review',
  'Completed',
];

const NOTE_TABS: NoteCategory[] = ['Client Discussion', 'Development', 'Work/General'];

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  userRole,
  selectedProjectId,
  onSelectProject,
  createModalOpen,
  prefillCustomerId,
  onCloseCreateModal,
  onOpenCreateModal,
  onViewInvoice,
  onDataChanged,
}) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | ProjectStatus>('All');
  const [search, setSearch] = useState('');

  // Project Detail state
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeNoteTab, setActiveNoteTab] = useState<NoteCategory>('Client Discussion');

  // Task form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);

  // Note form
  const [newNoteContent, setNewNoteContent] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  // Payment Schedule form
  const [schedTitle, setSchedTitle] = useState('');
  const [schedAmount, setSchedAmount] = useState('');
  const [schedDueDate, setSchedDueDate] = useState(todayISODate());
  const [schedNotes, setSchedNotes] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);

  // Quick Payment Modal inside Project Detail
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payTitle, setPayTitle] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayISODate());
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Add / Edit Project Modal
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('Pending');
  const [formBudget, setFormBudget] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isModalVisible = createModalOpen || editingProject !== null;

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projRes, custRes] = await Promise.all([
        api.listProjects({ status: statusFilter, search }),
        api.listCustomers(),
      ]);
      setProjects(projRes.projects);
      setCustomers(custRes.customers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetail = async (id: number) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await api.getProject(id);
      setDetail(res.project);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load project workspace.');
      onSelectProject(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, [statusFilter, search]);

  useEffect(() => {
    if (selectedProjectId) {
      void fetchProjectDetail(selectedProjectId);
    } else {
      setDetail(null);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (createModalOpen && !editingProject) {
      setFormTitle('');
      setFormCustomerId(
        prefillCustomerId
          ? String(prefillCustomerId)
          : customers[0]
            ? String(customers[0].id)
            : ''
      );
      setFormStatus('Pending');
      setFormBudget('');
      setFormStartDate(todayISODate());
      setFormEndDate('');
      setFormDescription('');
      setFormError(null);
    }
  }, [createModalOpen, editingProject, prefillCustomerId, customers]);

  const openEditProject = (proj: ProjectSummary) => {
    setEditingProject(proj);
    setFormTitle(proj.title);
    setFormCustomerId(String(proj.customer_id));
    setFormStatus(proj.status);
    setFormBudget(String(proj.budget));
    setFormStartDate(proj.start_date || '');
    setFormEndDate(proj.end_date || '');
    setFormDescription(proj.description || '');
    setFormError(null);
  };

  const closeModal = () => {
    setEditingProject(null);
    onCloseCreateModal();
    setFormError(null);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formTitle.trim()) {
      setFormError('Project title is required.');
      return;
    }
    if (!formCustomerId) {
      setFormError('Select a customer for this project.');
      return;
    }
    const parsedBudget = Number(formBudget);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
      setFormError('Enter a valid non-negative budget.');
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, {
          title: formTitle.trim(),
          customer_id: Number(formCustomerId),
          status: formStatus,
          budget: parsedBudget,
          start_date: formStartDate || null,
          end_date: formEndDate || null,
          description: formDescription.trim(),
        });
        if (detail && detail.id === editingProject.id) {
          await fetchProjectDetail(editingProject.id);
        }
      } else {
        await api.createProject({
          title: formTitle.trim(),
          customer_id: Number(formCustomerId),
          status: formStatus,
          budget: parsedBudget,
          start_date: formStartDate || null,
          end_date: formEndDate || null,
          description: formDescription.trim(),
        });
      }
      closeModal();
      await fetchProjects();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async (proj: ProjectSummary) => {
    try {
      await api.deleteProject(proj.id);
      if (selectedProjectId === proj.id) {
        onSelectProject(null);
      }
      await fetchProjects();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete project.');
    }
  };

  const handleStatusQuickChange = async (newStatus: ProjectStatus) => {
    if (!detail) return;
    try {
      await api.updateProject(detail.id, { status: newStatus });
      await fetchProjectDetail(detail.id);
      await fetchProjects();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update status.');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !newTaskTitle.trim()) return;
    setTaskBusy(true);
    try {
      await api.addTask(detail.id, {
        title: newTaskTitle.trim(),
        assignee_name: newTaskAssignee.trim() || 'Unassigned',
        due_date: newTaskDue || null,
      });
      setNewTaskTitle('');
      setNewTaskAssignee('');
      setNewTaskDue('');
      await fetchProjectDetail(detail.id);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add task.');
    } finally {
      setTaskBusy(false);
    }
  };

  const handleToggleTask = async (taskId: number, current: boolean) => {
    if (!detail) return;
    try {
      await api.toggleTask(detail.id, taskId, !current);
      await fetchProjectDetail(detail.id);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update task.');
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!detail) return;
    try {
      await api.deleteTask(detail.id, taskId);
      await fetchProjectDetail(detail.id);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete task.');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !newNoteContent.trim()) return;
    setNoteBusy(true);
    try {
      await api.addNote(detail.id, {
        category: activeNoteTab,
        content: newNoteContent.trim(),
      });
      setNewNoteContent('');
      await fetchProjectDetail(detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save note.');
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!detail) return;
    try {
      await api.deleteNote(detail.id, noteId);
      await fetchProjectDetail(detail.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete note.');
    }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const amountNum = Number(schedAmount);
    if (!schedTitle.trim() || !Number.isFinite(amountNum) || amountNum <= 0 || !schedDueDate) {
      setError('Enter a milestone title, valid BDT amount, and due date for the payment schedule.');
      return;
    }
    setSchedBusy(true);
    setError(null);
    try {
      await api.createPaymentSchedule(detail.id, {
        milestone_title: schedTitle.trim(),
        amount: amountNum,
        due_date: schedDueDate,
        notes: schedNotes.trim(),
      });
      setSchedTitle('');
      setSchedAmount('');
      setSchedNotes('');
      await fetchProjectDetail(detail.id);
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add payment reminder.');
    } finally {
      setSchedBusy(false);
    }
  };

  const handleMarkSchedulePaid = async (scheduleId: number) => {
    if (!detail) return;
    setError(null);
    try {
      await api.markSchedulePaid(detail.id, scheduleId, { record_payment: true });
      await fetchProjectDetail(detail.id);
      await fetchProjects();
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to settle scheduled payment.');
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!detail) return;
    setError(null);
    try {
      await api.deletePaymentSchedule(detail.id, scheduleId);
      await fetchProjectDetail(detail.id);
      onDataChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove payment schedule.');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setPayError(null);
    const amountNum = Number(payAmount);
    if (!payTitle.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setPayError('Provide a milestone title and an amount greater than 0.');
      return;
    }

    setPaySaving(true);
    try {
      await api.recordPayment({
        project_id: detail.id,
        milestone_title: payTitle.trim(),
        amount: amountNum,
        payment_date: payDate,
        payment_method: payMethod,
        notes: payNotes.trim(),
      });
      setPaymentModalOpen(false);
      setPayTitle('');
      setPayAmount('');
      setPayNotes('');
      await fetchProjectDetail(detail.id);
      await fetchProjects();
      onDataChanged();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Failed to record payment.');
    } finally {
      setPaySaving(false);
    }
  };

  // --- Project Detail Workspace ---
  if (selectedProjectId) {
    if (detailLoading && !detail) {
      return <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />;
    }

    if (detail) {
      const filteredNotes = detail.notes.filter((n) => n.category === activeNoteTab);

      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelectProject(null)}
              className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>All Projects</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openEditProject(detail)}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Edit Project</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayTitle(`Milestone ${detail.payments.length + 1} Payment`);
                  setPayAmount(detail.due_amount > 0 ? String(detail.due_amount) : '');
                  setPayDate(todayISODate());
                  setPayError(null);
                  setPaymentModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Record Payment</span>
              </button>
            </div>
          </div>

          {/* Header Summary & Financials */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-6">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono-tabular font-semibold text-slate-700">
                    {detail.project_code}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {detail.customer_company || detail.customer_name} ({detail.customer_code})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {formatDate(detail.start_date)} to {formatDate(detail.end_date)}
                  </span>
                </div>
                <h2 className="mt-1.5 font-display text-2xl font-bold text-slate-900">
                  {detail.title}
                </h2>
                {detail.description && (
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{detail.description}</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0">
                <label className="text-xs font-medium text-slate-500 flex items-center gap-2">
                  <span>Status</span>
                  <select
                    aria-label="Project status"
                    value={detail.status}
                    onChange={(e) => void handleStatusQuickChange(e.target.value as ProjectStatus)}
                    className="min-h-[38px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Completed">Completed</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Financial Progress Strip */}
            <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Total Budget</p>
                <p className="mt-1 font-mono-tabular text-base sm:text-lg font-semibold text-slate-900">
                  {formatCurrency(detail.budget)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Paid Amount</p>
                <p className="mt-1 font-mono-tabular text-base sm:text-lg font-semibold text-emerald-700">
                  {formatCurrency(detail.paid_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Auto-Calculated Due</p>
                <p
                  className={`mt-1 font-mono-tabular text-base sm:text-lg font-semibold ${
                    detail.due_amount > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(detail.due_amount)}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-teal-700 transition-all duration-300"
                  style={{ width: `${detail.progress_percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 font-mono-tabular">
                {detail.progress_percent}% collected · {detail.task_completed}/{detail.task_total} tasks completed
              </p>
            </div>
          </section>

          {/* Main 2-Column Workspace: Tasks & Categorized Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Tasks Checklist */}
            <section
              aria-labelledby="project-tasks-heading"
              className="lg:col-span-6 rounded-xl border border-slate-200/90 bg-white overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 id="project-tasks-heading" className="text-base font-semibold text-slate-900">
                  Project Tasks
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Checklist and team assignments for delivery tracking
                </p>
              </div>

              <form onSubmit={handleAddTask} className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-2.5">
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Add a deliverable or checklist item..."
                  aria-label="New task title"
                  className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    placeholder="Assignee (e.g. Rafiq)"
                    aria-label="Task assignee"
                    className="flex-1 min-w-[130px] min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                  />
                  <input
                    type="date"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    aria-label="Task due date"
                    className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-teal-700 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={taskBusy}
                    className="min-h-[38px] px-3.5 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Add Task
                  </button>
                </div>
              </form>

              {detail.tasks.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No tasks added yet. Add your first milestone checklist item above.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detail.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="px-5 py-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => void handleToggleTask(task.id, task.is_completed)}
                        aria-label={`${task.is_completed ? 'Mark incomplete' : 'Mark complete'}: ${task.title}`}
                        className="flex items-start gap-3 text-left flex-1 min-w-0 cursor-pointer"
                      >
                        {task.is_completed ? (
                          <CheckSquare className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-sm font-medium ${
                              task.is_completed ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {task.assignee_name}
                            {task.due_date ? ` · Due ${formatDate(task.due_date)}` : ''}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteTask(task.id)}
                        aria-label={`Delete task ${task.title}`}
                        className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Categorized Project Notes */}
            <section
              aria-labelledby="project-notes-heading"
              className="lg:col-span-6 rounded-xl border border-slate-200/90 bg-white overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 id="project-notes-heading" className="text-base font-semibold text-slate-900">
                  Categorized Project Notes
                </h3>
                <div
                  role="tablist"
                  aria-label="Project note categories"
                  className="mt-3 flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
                >
                  {NOTE_TABS.map((cat) => {
                    const count = detail.notes.filter((n) => n.category === cat).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        role="tab"
                        aria-selected={activeNoteTab === cat}
                        onClick={() => setActiveNoteTab(cat)}
                        className={`flex-1 min-h-[34px] px-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          activeNoteTab === cat
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleAddNote} className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-2.5">
                <textarea
                  rows={2}
                  required
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder={`Write a note under ${activeNoteTab}...`}
                  aria-label={`New note for ${activeNoteTab}`}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={noteBusy}
                    className="min-h-[38px] px-4 rounded-lg bg-teal-700 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                  >
                    Save to {activeNoteTab}
                  </button>
                </div>
              </form>

              {filteredNotes.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No notes under {activeNoteTab} yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredNotes.map((note) => (
                    <li key={note.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                          {note.content}
                        </p>
                        <p className="mt-1.5 text-xs text-slate-500">
                          {note.author_name} · {formatDate(note.created_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteNote(note.id)}
                        aria-label={`Delete note from ${note.author_name}`}
                        className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Payment Schedule & Automatic Reminders */}
          <section
            aria-labelledby="payment-schedule-heading"
            className="rounded-xl border border-slate-200/90 bg-white overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <h3 id="payment-schedule-heading" className="text-base font-semibold text-slate-900">
                  Payment Schedule &amp; Reminders
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Expected payment dates automatically trigger top-bar alerts when due or overdue
                </p>
              </div>
              <CalendarClock className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            </div>

            <form
              onSubmit={handleAddSchedule}
              className="p-4 border-b border-slate-100 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-12 gap-2.5"
            >
              <input
                type="text"
                required
                value={schedTitle}
                onChange={(e) => setSchedTitle(e.target.value)}
                placeholder="Milestone title (e.g., Final Delivery Payment)"
                aria-label="Scheduled payment milestone title"
                className="sm:col-span-5 min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                min="1"
                required
                value={schedAmount}
                onChange={(e) => setSchedAmount(e.target.value)}
                placeholder="Amount (BDT)"
                aria-label="Scheduled payment amount in BDT"
                className="sm:col-span-3 min-h-[40px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono-tabular text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
              />
              <input
                type="date"
                required
                value={schedDueDate}
                onChange={(e) => setSchedDueDate(e.target.value)}
                aria-label="Scheduled payment due date"
                className="sm:col-span-2 min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-teal-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={schedBusy}
                className="sm:col-span-2 min-h-[40px] px-3 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {schedBusy ? 'Adding...' : 'Add Reminder'}
              </button>
              <input
                type="text"
                value={schedNotes}
                onChange={(e) => setSchedNotes(e.target.value)}
                placeholder="Optional note (e.g., bank wire upon staging sign-off)"
                aria-label="Scheduled payment note"
                className="sm:col-span-12 min-h-[38px] rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
              />
            </form>

            {(!detail.schedules || detail.schedules.length === 0) ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No scheduled payment reminders yet. Add expected installment due dates above.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.schedules.map((sch) => {
                  const today = todayISODate();
                  const isPaid = sch.status === 'Paid';
                  const isOverdue = !isPaid && sch.due_date.slice(0, 10) < today;
                  const isDueToday = !isPaid && sch.due_date.slice(0, 10) === today;
                  return (
                    <div
                      key={sch.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`font-semibold ${
                              isPaid
                                ? 'text-emerald-700'
                                : isOverdue
                                  ? 'text-rose-700'
                                  : isDueToday
                                    ? 'text-amber-700'
                                    : 'text-slate-600'
                            }`}
                          >
                            {isPaid
                              ? 'Paid'
                              : isOverdue
                                ? 'Overdue'
                                : isDueToday
                                  ? 'Due Today'
                                  : 'Upcoming'}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono-tabular text-slate-600">
                            Due {formatDate(sch.due_date)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-slate-900">
                          {sch.milestone_title}
                        </p>
                        {sch.notes && (
                          <p className="text-xs text-slate-500 mt-0.5">{sch.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                          {formatCurrency(sch.amount)}
                        </span>
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => void handleMarkSchedulePaid(sch.id)}
                            className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-teal-200 bg-teal-50 text-xs font-medium text-teal-800 hover:bg-teal-100 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Paid</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteSchedule(sch.id)}
                          aria-label={`Delete payment schedule ${sch.milestone_title}`}
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Project Milestone Payments */}
          <section className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Milestone Payments & Invoices
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  All recorded payments automatically sync to agency Income ledger
                </p>
              </div>
            </div>

            {detail.payments.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No payments recorded for this project yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {detail.payments.map((pm) => (
                  <div
                    key={pm.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono-tabular font-semibold text-slate-700">
                          {pm.invoice_number}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(pm.payment_date)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{pm.payment_method}</span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-slate-900">
                        {pm.milestone_title}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular text-sm font-semibold text-emerald-700">
                        {formatCurrency(pm.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onViewInvoice(pm.id)}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Invoice</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Payment Modal */}
          {paymentModalOpen && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="proj-pay-title"
            >
              <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <h3 id="proj-pay-title" className="font-display text-lg font-bold text-slate-900">
                    Record Milestone Payment
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPaymentModalOpen(false)}
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

                <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="pp-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Milestone / Description *
                    </label>
                    <input
                      id="pp-title"
                      type="text"
                      required
                      value={payTitle}
                      onChange={(e) => setPayTitle(e.target.value)}
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pp-amount" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Amount (BDT) *
                      </label>
                      <input
                        id="pp-amount"
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
                      <label htmlFor="pp-date" className="block text-xs font-medium text-slate-700 mb-1.5">
                        Payment Date
                      </label>
                      <input
                        id="pp-date"
                        type="date"
                        required
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                        className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pp-method" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Payment Method
                    </label>
                    <select
                      id="pp-method"
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
                    <label htmlFor="pp-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                      Notes
                    </label>
                    <input
                      id="pp-notes"
                      type="text"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      placeholder="Reference number or settlement notes"
                      className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
                    />
                  </div>
                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentModalOpen(false)}
                      className="min-h-[42px] px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={paySaving}
                      className="min-h-[42px] px-4 rounded-lg bg-teal-700 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer"
                    >
                      {paySaving ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isModalVisible && (
            <ProjectFormModal
              isEdit={Boolean(editingProject)}
              customers={customers}
              title={formTitle}
              customerId={formCustomerId}
              status={formStatus}
              budget={formBudget}
              startDate={formStartDate}
              endDate={formEndDate}
              description={formDescription}
              error={formError}
              saving={saving}
              onChangeTitle={setFormTitle}
              onChangeCustomerId={setFormCustomerId}
              onChangeStatus={setFormStatus}
              onChangeBudget={setFormBudget}
              onChangeStartDate={setFormStartDate}
              onChangeEndDate={setFormEndDate}
              onChangeDescription={setFormDescription}
              onClose={closeModal}
              onSubmit={handleSaveProject}
            />
          )}
        </div>
      );
    }
  }

  // --- Projects List View ---
  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects by title, PRJ ID, or client..."
            aria-label="Search projects"
            className="w-full min-h-[42px] rounded-lg border border-slate-200 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {STATUS_TABS.map((st) => (
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

      <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No projects found</p>
            <p className="mt-1 text-xs text-slate-500">
              Create a project linked to any CRM customer to track tasks, notes, and billing.
            </p>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="mt-4 min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-800 cursor-pointer"
            >
              Create First Project
            </button>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-5 pr-3">ID</th>
                    <th className="py-3 px-3">Project & Client</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Tasks</th>
                    <th className="py-3 px-3 text-right">Budget</th>
                    <th className="py-3 px-3 text-right">Due</th>
                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 pl-5 pr-3 font-mono-tabular text-xs font-semibold text-slate-700 whitespace-nowrap">
                        {p.project_code}
                      </td>
                      <td className="py-3.5 px-3">
                        <button
                          type="button"
                          onClick={() => onSelectProject(p.id)}
                          className="text-left group cursor-pointer"
                        >
                          <p className="font-medium text-slate-900 group-hover:text-teal-700 transition-colors">
                            {p.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {p.customer_company || p.customer_name} · {p.customer_code}
                          </p>
                        </button>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`text-xs font-medium ${getProjectStatusTone(p.status)}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-mono-tabular text-xs text-slate-600">
                        {p.task_completed}/{p.task_total}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular font-medium text-slate-900">
                        {formatCurrency(p.budget)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono-tabular text-xs font-medium text-amber-700">
                        {formatCurrency(p.due_amount)}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onSelectProject(p.id)}
                            className="min-h-[34px] px-2.5 rounded-md text-xs font-medium text-teal-700 hover:bg-teal-50 cursor-pointer"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditProject(p)}
                            aria-label={`Edit ${p.title}`}
                            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {userRole === 'superadmin' && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteProject(p)}
                              aria-label={`Delete ${p.title}`}
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

            <div className="md:hidden divide-y divide-slate-100">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProject(p.id)}
                  className="w-full text-left p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-mono-tabular font-semibold text-slate-700">
                      {p.project_code}
                    </span>
                    <span className={`font-medium ${getProjectStatusTone(p.status)}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{p.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{p.customer_company || p.customer_name}</span>
                    <span className="font-mono-tabular font-medium text-slate-900 shrink-0">
                      {formatCurrency(p.budget)} · Due {formatCurrency(p.due_amount)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {isModalVisible && (
        <ProjectFormModal
          isEdit={Boolean(editingProject)}
          customers={customers}
          title={formTitle}
          customerId={formCustomerId}
          status={formStatus}
          budget={formBudget}
          startDate={formStartDate}
          endDate={formEndDate}
          description={formDescription}
          error={formError}
          saving={saving}
          onChangeTitle={setFormTitle}
          onChangeCustomerId={setFormCustomerId}
          onChangeStatus={setFormStatus}
          onChangeBudget={setFormBudget}
          onChangeStartDate={setFormStartDate}
          onChangeEndDate={setFormEndDate}
          onChangeDescription={setFormDescription}
          onClose={closeModal}
          onSubmit={handleSaveProject}
        />
      )}
    </div>
  );
};

interface ProjectFormModalProps {
  isEdit: boolean;
  customers: Customer[];
  title: string;
  customerId: string;
  status: ProjectStatus;
  budget: string;
  startDate: string;
  endDate: string;
  description: string;
  error: string | null;
  saving: boolean;
  onChangeTitle: (v: string) => void;
  onChangeCustomerId: (v: string) => void;
  onChangeStatus: (v: ProjectStatus) => void;
  onChangeBudget: (v: string) => void;
  onChangeStartDate: (v: string) => void;
  onChangeEndDate: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  isEdit,
  customers,
  title,
  customerId,
  status,
  budget,
  startDate,
  endDate,
  description,
  error,
  saving,
  onChangeTitle,
  onChangeCustomerId,
  onChangeStatus,
  onChangeBudget,
  onChangeStartDate,
  onChangeEndDate,
  onChangeDescription,
  onClose,
  onSubmit,
}) => (
  <div
    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-modal-title"
  >
    <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 bg-white p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <h3 id="project-modal-title" className="font-display text-lg font-bold text-slate-900">
          {isEdit ? 'Edit Project' : 'New Project'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close project modal"
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
        <div>
          <label htmlFor="proj-title" className="block text-xs font-medium text-slate-700 mb-1.5">
            Project Title *
          </label>
          <input
            id="proj-title"
            type="text"
            required
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder="e.g. Logistics Fleet Portal MVP"
            className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="proj-customer" className="block text-xs font-medium text-slate-700 mb-1.5">
              Customer *
            </label>
            <select
              id="proj-customer"
              required
              value={customerId}
              onChange={(e) => onChangeCustomerId(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customer_code} — {c.company || c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="proj-status" className="block text-xs font-medium text-slate-700 mb-1.5">
              Status
            </label>
            <select
              id="proj-status"
              value={status}
              onChange={(e) => onChangeStatus(e.target.value as ProjectStatus)}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Review">Review</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="proj-budget" className="block text-xs font-medium text-slate-700 mb-1.5">
              Budget (BDT) *
            </label>
            <input
              id="proj-budget"
              type="number"
              min="0"
              step="0.01"
              required
              value={budget}
              onChange={(e) => onChangeBudget(e.target.value)}
              placeholder="150000"
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm font-mono-tabular"
            />
          </div>
          <div>
            <label htmlFor="proj-start" className="block text-xs font-medium text-slate-700 mb-1.5">
              Start Date
            </label>
            <input
              id="proj-start"
              type="date"
              value={startDate}
              onChange={(e) => onChangeStartDate(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
          <div>
            <label htmlFor="proj-end" className="block text-xs font-medium text-slate-700 mb-1.5">
              End Date
            </label>
            <input
              id="proj-end"
              type="date"
              value={endDate}
              onChange={(e) => onChangeEndDate(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 px-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="proj-desc" className="block text-xs font-medium text-slate-700 mb-1.5">
            Scope Summary
          </label>
          <textarea
            id="proj-desc"
            rows={3}
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            placeholder="Deliverables, milestones, and technical scope..."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2">
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
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  </div>
);
