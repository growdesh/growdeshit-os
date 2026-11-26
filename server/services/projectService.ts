import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type PaymentScheduleRecord,
  type ProjectNoteRecord,
  type ProjectPaymentRecord,
  type ProjectRecord,
  type ProjectTaskRecord,
} from '../config/db';
import {
  NOTE_CATEGORIES,
  PROJECT_STATUSES,
  calculateProjectFinancials,
  generateProjectCode,
  validateNonNegativeAmount,
  type NoteCategory,
  type ProjectStatus,
} from '../utils/businessLogic';
import { ServiceError } from './customerService';

export interface ProjectSummary extends ProjectRecord {
  customer_name: string;
  customer_company: string;
  customer_code: string;
  paid_amount: number;
  due_amount: number;
  progress_percent: number;
  payment_status: 'Unpaid' | 'Partial' | 'Paid';
  task_total: number;
  task_completed: number;
}

export interface ProjectDetail extends ProjectSummary {
  customer_email: string;
  customer_phone: string;
  tasks: ProjectTaskRecord[];
  notes: ProjectNoteRecord[];
  payments: ProjectPaymentRecord[];
  schedules: PaymentScheduleRecord[];
}

export async function listProjects(filters?: {
  status?: string;
  customerId?: number;
  search?: string;
}): Promise<ProjectSummary[]> {
  const statusFilter = filters?.status?.trim() || '';
  const search = filters?.search?.trim().toLowerCase() || '';
  const customerId = filters?.customerId;

  if (isMysqlMode()) {
    const pool = getPool();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (statusFilter && statusFilter !== 'All') {
      conditions.push('p.status = ?');
      params.push(statusFilter);
    }
    if (customerId) {
      conditions.push('p.customer_id = ?');
      params.push(customerId);
    }
    if (search) {
      conditions.push(
        '(LOWER(p.title) LIKE ? OR LOWER(p.project_code) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(c.company) LIKE ?)'
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*,
        c.name AS customer_name,
        c.company AS customer_company,
        c.customer_code AS customer_code,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_total,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.is_completed = 1) AS task_completed
       FROM projects p
       INNER JOIN customers c ON c.id = p.customer_id
       ${whereClause}
       ORDER BY p.id DESC`,
      params
    );

    const [paymentRows] = await pool.execute<RowDataPacket[]>(
      'SELECT project_id, amount FROM project_payments'
    );
    const payments = paymentRows as Array<{ project_id: number; amount: number }>;

    return rows.map((row) => {
      const fin = calculateProjectFinancials(
        Number(row.budget),
        payments.filter((pm) => pm.project_id === Number(row.id))
      );
      return {
        ...(row as ProjectRecord),
        budget: Number(row.budget),
        customer_name: String(row.customer_name),
        customer_company: String(row.customer_company || ''),
        customer_code: String(row.customer_code),
        paid_amount: fin.paidAmount,
        due_amount: fin.dueAmount,
        progress_percent: fin.progressPercent,
        payment_status: fin.paymentStatus,
        task_total: Number(row.task_total ?? 0),
        task_completed: Number(row.task_completed ?? 0),
      };
    });
  }

  return memoryStore.projects
    .filter((p) => {
      if (statusFilter && statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (customerId && p.customer_id !== customerId) return false;
      if (search) {
        const customer = memoryStore.customers.find((c) => c.id === p.customer_id);
        const matches =
          p.title.toLowerCase().includes(search) ||
          p.project_code.toLowerCase().includes(search) ||
          (customer?.name.toLowerCase().includes(search) ?? false) ||
          (customer?.company.toLowerCase().includes(search) ?? false);
        if (!matches) return false;
      }
      return true;
    })
    .sort((a, b) => b.id - a.id)
    .map((p) => {
      const customer = memoryStore.customers.find((c) => c.id === p.customer_id);
      const payments = memoryStore.projectPayments.filter((pm) => pm.project_id === p.id);
      const tasks = memoryStore.projectTasks.filter((t) => t.project_id === p.id);
      const fin = calculateProjectFinancials(p.budget, payments);

      return {
        ...p,
        customer_name: customer?.name || 'Unknown Customer',
        customer_company: customer?.company || '',
        customer_code: customer?.customer_code || 'CU-000',
        paid_amount: fin.paidAmount,
        due_amount: fin.dueAmount,
        progress_percent: fin.progressPercent,
        payment_status: fin.paymentStatus,
        task_total: tasks.length,
        task_completed: tasks.filter((t) => t.is_completed).length,
      };
    });
}

export async function getProjectById(id: number): Promise<ProjectDetail | null> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*,
        c.name AS customer_name,
        c.company AS customer_company,
        c.customer_code AS customer_code,
        c.email AS customer_email,
        c.phone AS customer_phone
       FROM projects p
       INNER JOIN customers c ON c.id = p.customer_id
       WHERE p.id = ? LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return null;

    const [taskRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_tasks WHERE project_id = ? ORDER BY is_completed ASC, id DESC',
      [id]
    );
    const [noteRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_notes WHERE project_id = ? ORDER BY id DESC',
      [id]
    );
    const [paymentRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_payments WHERE project_id = ? ORDER BY payment_date DESC, id DESC',
      [id]
    );
    const [scheduleRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM payment_schedules WHERE project_id = ? ORDER BY status ASC, due_date ASC, id DESC',
      [id]
    );

    const tasks = taskRows.map((t) => ({
      ...(t as ProjectTaskRecord),
      is_completed: Boolean(t.is_completed),
    }));
    const notes = noteRows as ProjectNoteRecord[];
    const payments = paymentRows.map((pm) => ({
      ...(pm as ProjectPaymentRecord),
      amount: Number(pm.amount),
    }));
    const schedules = scheduleRows.map((s) => ({
      ...(s as PaymentScheduleRecord),
      amount: Number(s.amount),
    }));
    const fin = calculateProjectFinancials(Number(row.budget), payments);

    return {
      ...(row as ProjectRecord),
      budget: Number(row.budget),
      customer_name: String(row.customer_name),
      customer_company: String(row.customer_company || ''),
      customer_code: String(row.customer_code),
      customer_email: String(row.customer_email || ''),
      customer_phone: String(row.customer_phone || ''),
      paid_amount: fin.paidAmount,
      due_amount: fin.dueAmount,
      progress_percent: fin.progressPercent,
      payment_status: fin.paymentStatus,
      task_total: tasks.length,
      task_completed: tasks.filter((t) => t.is_completed).length,
      tasks,
      notes,
      payments,
      schedules,
    };
  }

  const project = memoryStore.projects.find((p) => p.id === id);
  if (!project) return null;

  const customer = memoryStore.customers.find((c) => c.id === project.customer_id);
  const tasks = memoryStore.projectTasks
    .filter((t) => t.project_id === id)
    .sort((a, b) => Number(a.is_completed) - Number(b.is_completed) || b.id - a.id);
  const notes = memoryStore.projectNotes
    .filter((n) => n.project_id === id)
    .sort((a, b) => b.id - a.id);
  const payments = memoryStore.projectPayments
    .filter((pm) => pm.project_id === id)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id - a.id);
  const schedules = memoryStore.paymentSchedules
    .filter((s) => s.project_id === id)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
      return a.due_date.localeCompare(b.due_date) || b.id - a.id;
    });
  const fin = calculateProjectFinancials(project.budget, payments);

  return {
    ...project,
    customer_name: customer?.name || 'Unknown Customer',
    customer_company: customer?.company || '',
    customer_code: customer?.customer_code || 'CU-000',
    customer_email: customer?.email || '',
    customer_phone: customer?.phone || '',
    paid_amount: fin.paidAmount,
    due_amount: fin.dueAmount,
    progress_percent: fin.progressPercent,
    payment_status: fin.paymentStatus,
    task_total: tasks.length,
    task_completed: tasks.filter((t) => t.is_completed).length,
    tasks,
    notes,
    payments,
    schedules,
  };
}

export async function createProject(input: {
  customer_id: number;
  title: string;
  status?: ProjectStatus;
  budget: number;
  start_date?: string | null;
  end_date?: string | null;
  description?: string;
}): Promise<ProjectRecord> {
  const title = input.title?.trim();
  if (!title) throw new ServiceError('Project title is required.', 400);

  const customerId = Number(input.customer_id);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new ServiceError('A valid customer must be selected.', 400);
  }

  const budget = validateNonNegativeAmount(input.budget);
  if (budget === null) {
    throw new ServiceError('Budget must be a valid non-negative number.', 400);
  }

  const status: ProjectStatus = PROJECT_STATUSES.includes(input.status as ProjectStatus)
    ? (input.status as ProjectStatus)
    : 'Pending';
  const startDate = input.start_date?.trim() || null;
  const endDate = input.end_date?.trim() || null;
  const description = input.description?.trim() || '';

  if (isMysqlMode()) {
    const pool = getPool();
    const [custRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );
    if (custRows.length === 0) {
      throw new ServiceError('Selected customer does not exist.', 404);
    }

    const [codeRows] = await pool.execute<RowDataPacket[]>('SELECT project_code FROM projects');
    const projectCode = generateProjectCode(codeRows.map((r) => String(r.project_code)));

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO projects (project_code, customer_id, title, status, budget, start_date, end_date, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectCode, customerId, title, status, budget, startDate, endDate, description]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    const created = rows[0] as ProjectRecord;
    return { ...created, budget: Number(created.budget) };
  }

  const customer = memoryStore.customers.find((c) => c.id === customerId);
  if (!customer) {
    throw new ServiceError('Selected customer does not exist.', 404);
  }

  const projectCode = generateProjectCode(memoryStore.projects.map((p) => p.project_code));
  const now = new Date().toISOString();
  const created: ProjectRecord = {
    id: memoryStore.seq.projects++,
    project_code: projectCode,
    customer_id: customerId,
    title,
    status,
    budget,
    start_date: startDate,
    end_date: endDate,
    description,
    created_at: now,
    updated_at: now,
  };
  memoryStore.projects.push(created);
  return created;
}

export async function updateProject(
  id: number,
  input: {
    customer_id?: number;
    title?: string;
    status?: ProjectStatus;
    budget?: number;
    start_date?: string | null;
    end_date?: string | null;
    description?: string;
  }
): Promise<ProjectRecord> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [id]
    );
    const existing = existingRows[0] as ProjectRecord | undefined;
    if (!existing) throw new ServiceError('Project not found.', 404);

    const title = input.title !== undefined ? input.title.trim() : existing.title;
    if (!title) throw new ServiceError('Project title cannot be empty.', 400);

    const customerId = input.customer_id !== undefined ? Number(input.customer_id) : existing.customer_id;
    const status =
      input.status && PROJECT_STATUSES.includes(input.status) ? input.status : existing.status;

    let budget = Number(existing.budget);
    if (input.budget !== undefined) {
      const parsed = validateNonNegativeAmount(input.budget);
      if (parsed === null) throw new ServiceError('Budget must be non-negative.', 400);
      budget = parsed;
    }

    const startDate = input.start_date !== undefined ? input.start_date?.trim() || null : existing.start_date;
    const endDate = input.end_date !== undefined ? input.end_date?.trim() || null : existing.end_date;
    const description = input.description !== undefined ? input.description.trim() : existing.description;

    await pool.execute(
      `UPDATE projects SET customer_id = ?, title = ?, status = ?, budget = ?, start_date = ?, end_date = ?, description = ? WHERE id = ?`,
      [customerId, title, status, budget, startDate, endDate, description, id]
    );

    const [updatedRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [id]
    );
    const updated = updatedRows[0] as ProjectRecord;
    return { ...updated, budget: Number(updated.budget) };
  }

  const project = memoryStore.projects.find((p) => p.id === id);
  if (!project) throw new ServiceError('Project not found.', 404);

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) throw new ServiceError('Project title cannot be empty.', 400);
    project.title = trimmed;
  }
  if (input.customer_id !== undefined) {
    const exists = memoryStore.customers.some((c) => c.id === Number(input.customer_id));
    if (!exists) throw new ServiceError('Selected customer does not exist.', 404);
    project.customer_id = Number(input.customer_id);
  }
  if (input.status && PROJECT_STATUSES.includes(input.status)) {
    project.status = input.status;
  }
  if (input.budget !== undefined) {
    const parsed = validateNonNegativeAmount(input.budget);
    if (parsed === null) throw new ServiceError('Budget must be non-negative.', 400);
    project.budget = parsed;
  }
  if (input.start_date !== undefined) project.start_date = input.start_date?.trim() || null;
  if (input.end_date !== undefined) project.end_date = input.end_date?.trim() || null;
  if (input.description !== undefined) project.description = input.description.trim();
  project.updated_at = new Date().toISOString();

  return project;
}

export async function deleteProject(id: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM projects WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new ServiceError('Project not found.', 404);
    return;
  }

  const idx = memoryStore.projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new ServiceError('Project not found.', 404);

  memoryStore.projects.splice(idx, 1);
  memoryStore.projectTasks = memoryStore.projectTasks.filter((t) => t.project_id !== id);
  memoryStore.projectNotes = memoryStore.projectNotes.filter((n) => n.project_id !== id);
  const removedPaymentIds = new Set(
    memoryStore.projectPayments.filter((pm) => pm.project_id === id).map((pm) => pm.id)
  );
  memoryStore.projectPayments = memoryStore.projectPayments.filter((pm) => pm.project_id !== id);
  memoryStore.paymentSchedules = memoryStore.paymentSchedules.filter((s) => s.project_id !== id);
  memoryStore.notifications = memoryStore.notifications.filter((n) => n.project_id !== id);
  memoryStore.transactions = memoryStore.transactions.filter(
    (tx) => !(tx.payment_id && removedPaymentIds.has(tx.payment_id))
  );
}

export async function findCustomerIdByCode(customerCode: string): Promise<number | null> {
  const normalized = customerCode.trim().toUpperCase();
  if (!normalized) return null;

  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT id FROM customers WHERE UPPER(customer_code) = ? LIMIT 1',
      [normalized]
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  const found = memoryStore.customers.find(
    (c) => c.customer_code.toUpperCase() === normalized
  );
  return found ? found.id : null;
}

export async function findProjectIdByCode(projectCode: string): Promise<number | null> {
  const normalized = projectCode.trim().toUpperCase();
  if (!normalized) return null;

  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      'SELECT id FROM projects WHERE UPPER(project_code) = ? LIMIT 1',
      [normalized]
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  const found = memoryStore.projects.find((p) => p.project_code.toUpperCase() === normalized);
  return found ? found.id : null;
}

// --- Project Tasks ---
export async function addProjectTask(
  projectId: number,
  input: {
    title: string;
    assignee_name?: string;
    assignee_id?: number | null;
    due_date?: string | null;
  }
): Promise<ProjectTaskRecord> {
  const title = input.title?.trim();
  if (!title) throw new ServiceError('Task title is required.', 400);

  const assigneeName = input.assignee_name?.trim() || 'Unassigned';
  const assigneeId = input.assignee_id ? Number(input.assignee_id) : null;
  const dueDate = input.due_date?.trim() || null;

  if (isMysqlMode()) {
    const pool = getPool();
    const [projRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (projRows.length === 0) throw new ServiceError('Project not found.', 404);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_tasks (project_id, title, assignee_name, assignee_id, is_completed, due_date)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [projectId, title, assigneeName, assigneeId, dueDate]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_tasks WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    const task = rows[0];
    return { ...(task as ProjectTaskRecord), is_completed: Boolean(task.is_completed) };
  }

  if (!memoryStore.projects.some((p) => p.id === projectId)) {
    throw new ServiceError('Project not found.', 404);
  }

  const created: ProjectTaskRecord = {
    id: memoryStore.seq.projectTasks++,
    project_id: projectId,
    title,
    assignee_name: assigneeName,
    assignee_id: assigneeId,
    is_completed: false,
    due_date: dueDate,
    created_at: new Date().toISOString(),
  };
  memoryStore.projectTasks.push(created);
  return created;
}

export async function toggleProjectTask(
  projectId: number,
  taskId: number,
  isCompleted: boolean
): Promise<ProjectTaskRecord> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE project_tasks SET is_completed = ? WHERE id = ? AND project_id = ?',
      [isCompleted ? 1 : 0, taskId, projectId]
    );
    if (result.affectedRows === 0) throw new ServiceError('Task not found.', 404);

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_tasks WHERE id = ? LIMIT 1',
      [taskId]
    );
    const task = rows[0];
    return { ...(task as ProjectTaskRecord), is_completed: Boolean(task.is_completed) };
  }

  const task = memoryStore.projectTasks.find((t) => t.id === taskId && t.project_id === projectId);
  if (!task) throw new ServiceError('Task not found.', 404);
  task.is_completed = Boolean(isCompleted);
  return task;
}

export async function deleteProjectTask(projectId: number, taskId: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM project_tasks WHERE id = ? AND project_id = ?',
      [taskId, projectId]
    );
    if (result.affectedRows === 0) throw new ServiceError('Task not found.', 404);
    return;
  }

  const idx = memoryStore.projectTasks.findIndex(
    (t) => t.id === taskId && t.project_id === projectId
  );
  if (idx === -1) throw new ServiceError('Task not found.', 404);
  memoryStore.projectTasks.splice(idx, 1);
}

// --- Categorized Project Notes ---
export async function addProjectNote(
  projectId: number,
  input: {
    category: NoteCategory;
    content: string;
    author_name: string;
    author_id?: number | null;
  }
): Promise<ProjectNoteRecord> {
  const content = input.content?.trim();
  if (!content) throw new ServiceError('Note content is required.', 400);

  const category: NoteCategory = NOTE_CATEGORIES.includes(input.category)
    ? input.category
    : 'Work/General';
  const authorName = input.author_name?.trim() || 'Team Member';
  const authorId = input.author_id ?? null;

  if (isMysqlMode()) {
    const pool = getPool();
    const [projRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (projRows.length === 0) throw new ServiceError('Project not found.', 404);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_notes (project_id, category, content, author_name, author_id)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, category, content, authorName, authorId]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM project_notes WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    return rows[0] as ProjectNoteRecord;
  }

  if (!memoryStore.projects.some((p) => p.id === projectId)) {
    throw new ServiceError('Project not found.', 404);
  }

  const created: ProjectNoteRecord = {
    id: memoryStore.seq.projectNotes++,
    project_id: projectId,
    category,
    content,
    author_name: authorName,
    author_id: authorId,
    created_at: new Date().toISOString(),
  };
  memoryStore.projectNotes.push(created);
  return created;
}

export async function deleteProjectNote(projectId: number, noteId: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM project_notes WHERE id = ? AND project_id = ?',
      [noteId, projectId]
    );
    if (result.affectedRows === 0) throw new ServiceError('Note not found.', 404);
    return;
  }

  const idx = memoryStore.projectNotes.findIndex(
    (n) => n.id === noteId && n.project_id === projectId
  );
  if (idx === -1) throw new ServiceError('Note not found.', 404);
  memoryStore.projectNotes.splice(idx, 1);
}
