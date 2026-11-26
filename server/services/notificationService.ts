import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type NotificationRecord,
  type PaymentScheduleRecord,
} from '../config/db';
import {
  formatBdtPlain,
  isScheduleDueOrOverdue,
  validatePositiveAmount,
} from '../utils/businessLogic';
import { ServiceError } from './customerService';
import { recordProjectPayment, type PaymentWithMeta } from './financeService';

export interface PaymentScheduleWithProject extends PaymentScheduleRecord {
  project_code: string;
  project_title: string;
  customer_code: string;
}

export interface NotificationWithMeta extends NotificationRecord {
  project_code: string | null;
  project_title: string | null;
}

export async function listPaymentSchedules(
  projectId?: number
): Promise<PaymentScheduleWithProject[]> {
  if (isMysqlMode()) {
    const whereClause = projectId ? 'WHERE ps.project_id = ?' : '';
    const params: Array<string | number> = projectId ? [projectId] : [];
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT ps.*,
        p.project_code AS project_code,
        p.title AS project_title,
        c.customer_code AS customer_code
       FROM payment_schedules ps
       INNER JOIN projects p ON p.id = ps.project_id
       INNER JOIN customers c ON c.id = p.customer_id
       ${whereClause}
       ORDER BY ps.status ASC, ps.due_date ASC, ps.id DESC`,
      params
    );
    return rows.map((row) => ({
      ...(row as PaymentScheduleRecord),
      amount: Number(row.amount),
      project_code: String(row.project_code),
      project_title: String(row.project_title),
      customer_code: String(row.customer_code),
    }));
  }

  return memoryStore.paymentSchedules
    .filter((ps) => (!projectId ? true : ps.project_id === projectId))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
      return a.due_date.localeCompare(b.due_date) || b.id - a.id;
    })
    .map((ps) => {
      const project = memoryStore.projects.find((p) => p.id === ps.project_id);
      const customer = project
        ? memoryStore.customers.find((c) => c.id === project.customer_id)
        : undefined;
      return {
        ...ps,
        project_code: project?.project_code || 'PRJ-000',
        project_title: project?.title || 'Deleted Project',
        customer_code: customer?.customer_code || 'CU-000',
      };
    });
}

export async function createPaymentSchedule(input: {
  project_id: number;
  milestone_title: string;
  amount: number;
  due_date: string;
  notes?: string;
}): Promise<PaymentScheduleWithProject> {
  const projectId = Number(input.project_id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new ServiceError('A valid project is required.', 400);
  }
  const milestoneTitle = input.milestone_title?.trim();
  if (!milestoneTitle) {
    throw new ServiceError('Milestone title or payment note is required.', 400);
  }
  const amount = validatePositiveAmount(input.amount);
  if (amount === null) {
    throw new ServiceError('Scheduled amount must be greater than 0.', 400);
  }
  const dueDate = input.due_date?.trim().slice(0, 10);
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new ServiceError('A valid due date (YYYY-MM-DD) is required.', 400);
  }
  const notes = input.notes?.trim() || '';

  if (isMysqlMode()) {
    const pool = getPool();
    const [projRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (projRows.length === 0) throw new ServiceError('Project not found.', 404);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_schedules (project_id, milestone_title, amount, due_date, status, notes)
       VALUES (?, ?, ?, ?, 'Pending', ?)`,
      [projectId, milestoneTitle, amount, dueDate, notes]
    );

    await syncDuePaymentNotifications();
    const all = await listPaymentSchedules(projectId);
    const created = all.find((s) => s.id === result.insertId);
    if (!created) throw new ServiceError('Failed to load created payment schedule.', 500);
    return created;
  }

  if (!memoryStore.projects.some((p) => p.id === projectId)) {
    throw new ServiceError('Project not found.', 404);
  }

  const created: PaymentScheduleRecord = {
    id: memoryStore.seq.paymentSchedules++,
    project_id: projectId,
    milestone_title: milestoneTitle,
    amount,
    due_date: dueDate,
    status: 'Pending',
    paid_payment_id: null,
    notes,
    created_at: new Date().toISOString(),
  };
  memoryStore.paymentSchedules.push(created);

  await syncDuePaymentNotifications();
  const all = await listPaymentSchedules(projectId);
  const found = all.find((s) => s.id === created.id);
  if (!found) throw new ServiceError('Failed to load created payment schedule.', 500);
  return found;
}

export async function markSchedulePaid(
  projectId: number,
  scheduleId: number,
  options?: {
    recordPayment?: boolean;
    paymentMethod?: string;
    createdBy?: number | null;
  }
): Promise<{ schedule: PaymentScheduleWithProject; payment: PaymentWithMeta | null }> {
  const shouldRecordPayment = options?.recordPayment !== false;

  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM payment_schedules WHERE id = ? AND project_id = ? LIMIT 1',
      [scheduleId, projectId]
    );
    const existing = rows[0] as PaymentScheduleRecord | undefined;
    if (!existing) throw new ServiceError('Payment schedule not found.', 404);
    if (existing.status === 'Paid') {
      const list = await listPaymentSchedules(projectId);
      const already = list.find((s) => s.id === scheduleId)!;
      return { schedule: already, payment: null };
    }

    let payment: PaymentWithMeta | null = null;
    if (shouldRecordPayment) {
      payment = await recordProjectPayment({
        project_id: projectId,
        milestone_title: existing.milestone_title,
        amount: Number(existing.amount),
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: options?.paymentMethod || 'Bank Transfer',
        notes: existing.notes || `Settled scheduled reminder (Due ${existing.due_date})`,
        created_by: options?.createdBy ?? null,
      });
    }

    await pool.execute(
      `UPDATE payment_schedules SET status = 'Paid', paid_payment_id = ? WHERE id = ?`,
      [payment ? payment.id : null, scheduleId]
    );
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE schedule_id = ?', [scheduleId]);

    const list = await listPaymentSchedules(projectId);
    const updated = list.find((s) => s.id === scheduleId);
    if (!updated) throw new ServiceError('Failed to load updated schedule.', 500);
    return { schedule: updated, payment };
  }

  const existing = memoryStore.paymentSchedules.find(
    (s) => s.id === scheduleId && s.project_id === projectId
  );
  if (!existing) throw new ServiceError('Payment schedule not found.', 404);
  if (existing.status === 'Paid') {
    const list = await listPaymentSchedules(projectId);
    return { schedule: list.find((s) => s.id === scheduleId)!, payment: null };
  }

  let payment: PaymentWithMeta | null = null;
  if (shouldRecordPayment) {
    payment = await recordProjectPayment({
      project_id: projectId,
      milestone_title: existing.milestone_title,
      amount: existing.amount,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: options?.paymentMethod || 'Bank Transfer',
      notes: existing.notes || `Settled scheduled reminder (Due ${existing.due_date})`,
      created_by: options?.createdBy ?? null,
    });
  }

  existing.status = 'Paid';
  existing.paid_payment_id = payment ? payment.id : null;
  for (const notif of memoryStore.notifications) {
    if (notif.schedule_id === scheduleId) {
      notif.is_read = true;
    }
  }

  const list = await listPaymentSchedules(projectId);
  const updated = list.find((s) => s.id === scheduleId);
  if (!updated) throw new ServiceError('Failed to load updated schedule.', 500);
  return { schedule: updated, payment };
}

export async function getPaymentScheduleById(
  projectId: number,
  scheduleId: number
): Promise<PaymentScheduleWithProject | null> {
  const list = await listPaymentSchedules(projectId);
  return list.find((s) => s.id === scheduleId) ?? null;
}

export async function linkPaymentToSchedule(
  projectId: number,
  scheduleId: number,
  paymentId: number
): Promise<PaymentScheduleWithProject> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, status FROM payment_schedules WHERE id = ? AND project_id = ? LIMIT 1',
      [scheduleId, projectId]
    );
    if (rows.length === 0) {
      throw new ServiceError('Payment schedule not found for this project.', 404);
    }

    await pool.execute(
      `UPDATE payment_schedules SET status = 'Paid', paid_payment_id = ? WHERE id = ? AND project_id = ?`,
      [paymentId, scheduleId, projectId]
    );
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE schedule_id = ?', [scheduleId]);

    const updated = await getPaymentScheduleById(projectId, scheduleId);
    if (!updated) throw new ServiceError('Failed to load updated payment schedule.', 500);
    return updated;
  }

  const existing = memoryStore.paymentSchedules.find(
    (s) => s.id === scheduleId && s.project_id === projectId
  );
  if (!existing) {
    throw new ServiceError('Payment schedule not found for this project.', 404);
  }
  existing.status = 'Paid';
  existing.paid_payment_id = paymentId;
  for (const notif of memoryStore.notifications) {
    if (notif.schedule_id === scheduleId) {
      notif.is_read = true;
    }
  }
  const updated = await getPaymentScheduleById(projectId, scheduleId);
  if (!updated) throw new ServiceError('Failed to load updated payment schedule.', 500);
  return updated;
}

export async function deletePaymentSchedule(projectId: number, scheduleId: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM payment_schedules WHERE id = ? AND project_id = ?',
      [scheduleId, projectId]
    );
    if (result.affectedRows === 0) throw new ServiceError('Payment schedule not found.', 404);
    return;
  }

  const idx = memoryStore.paymentSchedules.findIndex(
    (s) => s.id === scheduleId && s.project_id === projectId
  );
  if (idx === -1) throw new ServiceError('Payment schedule not found.', 404);
  memoryStore.paymentSchedules.splice(idx, 1);
  memoryStore.notifications = memoryStore.notifications.filter((n) => n.schedule_id !== scheduleId);
}

export async function syncDuePaymentNotifications(
  todayIso = new Date().toISOString().slice(0, 10)
): Promise<number> {
  let createdCount = 0;

  if (isMysqlMode()) {
    const pool = getPool();
    const [schedules] = await pool.execute<RowDataPacket[]>(
      `SELECT ps.*, p.project_code, p.title AS project_title
       FROM payment_schedules ps
       INNER JOIN projects p ON p.id = ps.project_id
       WHERE ps.status = 'Pending' AND ps.due_date <= ?`,
      [todayIso]
    );

    for (const row of schedules) {
      const scheduleId = Number(row.id);
      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM notifications WHERE schedule_id = ? LIMIT 1',
        [scheduleId]
      );
      if (existing.length > 0) continue;

      const projectCode = String(row.project_code);
      const dueDate = String(row.due_date).slice(0, 10);
      const amount = Number(row.amount);
      const isOverdue = dueDate < todayIso;
      const title = isOverdue
        ? `Overdue Payment: ${projectCode}`
        : `Payment Due Today: ${projectCode}`;
      const message = `${formatBdtPlain(amount)} due on ${dueDate} for ${String(row.milestone_title)} (${String(row.project_title)}).`;

      await pool.execute(
        `INSERT INTO notifications (type, title, message, project_id, schedule_id, amount, due_date, is_read)
         VALUES ('payment_due', ?, ?, ?, ?, ?, ?, 0)`,
        [title, message, Number(row.project_id), scheduleId, amount, dueDate]
      );
      createdCount++;
    }
    return createdCount;
  }

  for (const schedule of memoryStore.paymentSchedules) {
    if (!isScheduleDueOrOverdue(schedule.due_date, schedule.status, todayIso)) {
      continue;
    }
    const alreadyExists = memoryStore.notifications.some((n) => n.schedule_id === schedule.id);
    if (alreadyExists) continue;

    const project = memoryStore.projects.find((p) => p.id === schedule.project_id);
    const projectCode = project?.project_code || `PRJ-${schedule.project_id}`;
    const projectTitle = project?.title || 'Project';
    const isOverdue = schedule.due_date.slice(0, 10) < todayIso;
    const title = isOverdue
      ? `Overdue Payment: ${projectCode}`
      : `Payment Due Today: ${projectCode}`;
    const message = `${formatBdtPlain(schedule.amount)} due on ${schedule.due_date} for ${schedule.milestone_title} (${projectTitle}).`;

    memoryStore.notifications.push({
      id: memoryStore.seq.notifications++,
      type: 'payment_due',
      title,
      message,
      project_id: schedule.project_id,
      schedule_id: schedule.id,
      amount: schedule.amount,
      due_date: schedule.due_date,
      is_read: false,
      created_at: new Date().toISOString(),
    });
    createdCount++;
  }

  return createdCount;
}

export async function listNotifications(): Promise<{
  notifications: NotificationWithMeta[];
  unreadCount: number;
}> {
  await syncDuePaymentNotifications();

  if (isMysqlMode()) {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT n.*, p.project_code, p.title AS project_title
       FROM notifications n
       LEFT JOIN projects p ON p.id = n.project_id
       ORDER BY n.is_read ASC, n.due_date ASC, n.created_at DESC
       LIMIT 50`
    );
    const notifications: NotificationWithMeta[] = rows.map((row) => ({
      ...(row as NotificationRecord),
      amount: row.amount !== null ? Number(row.amount) : null,
      is_read: Boolean(row.is_read),
      project_code: row.project_code ? String(row.project_code) : null,
      project_title: row.project_title ? String(row.project_title) : null,
    }));
    const unreadCount = notifications.filter((n) => !n.is_read).length;
    return { notifications, unreadCount };
  }

  const notifications: NotificationWithMeta[] = memoryStore.notifications
    .map((n) => {
      const project = n.project_id
        ? memoryStore.projects.find((p) => p.id === n.project_id)
        : undefined;
      return {
        ...n,
        project_code: project?.project_code || null,
        project_title: project?.title || null,
      };
    })
    .sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
      return b.created_at.localeCompare(a.created_at) || b.id - a.id;
    })
    .slice(0, 50);

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
  };
}

export async function markNotificationRead(id: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) throw new ServiceError('Notification not found.', 404);
    return;
  }

  const notif = memoryStore.notifications.find((n) => n.id === id);
  if (!notif) throw new ServiceError('Notification not found.', 404);
  notif.is_read = true;
}

export async function markAllNotificationsRead(): Promise<void> {
  if (isMysqlMode()) {
    await getPool().execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
    return;
  }

  for (const notif of memoryStore.notifications) {
    notif.is_read = true;
  }
}
