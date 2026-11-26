import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import { ServiceError } from '../services/customerService';
import {
  createPaymentSchedule,
  deletePaymentSchedule,
  listNotifications,
  listPaymentSchedules,
  markAllNotificationsRead,
  markNotificationRead,
  markSchedulePaid,
} from '../services/notificationService';
import { formatBdtPlain } from '../utils/businessLogic';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[NotificationController]', error);
  res.status(500).json({ error: 'Notification operation failed.' });
}

export async function getNotificationsHandler(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const data = await listNotifications();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
}

export async function markNotificationReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid notification ID.' });
      return;
    }
    await markNotificationRead(id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markAllNotificationsReadHandler(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    await markAllNotificationsRead();
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function listSchedulesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const projectId = req.params.id ? Number(req.params.id) : undefined;
    if (projectId !== undefined && (!Number.isInteger(projectId) || projectId <= 0)) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const schedules = await listPaymentSchedules(projectId);
    res.json({ schedules });
  } catch (error) {
    handleError(res, error);
  }
}

export async function createScheduleHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    const schedule = await createPaymentSchedule({
      project_id: projectId,
      milestone_title: String(req.body?.milestone_title ?? ''),
      amount: Number(req.body?.amount ?? 0),
      due_date: String(req.body?.due_date ?? ''),
      notes: typeof req.body?.notes === 'string' ? req.body.notes : '',
    });

    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'schedule.created',
        entity_type: 'PaymentSchedule',
        entity_id: `${schedule.project_code}#${schedule.id}`,
        source: 'Web',
        details: `Scheduled ${formatBdtPlain(schedule.amount)} due ${schedule.due_date} (${schedule.milestone_title})`,
      });
    }

    res.status(201).json({ schedule });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markSchedulePaidHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(projectId) || !Number.isInteger(scheduleId)) {
      res.status(400).json({ error: 'Invalid project or schedule ID.' });
      return;
    }

    const result = await markSchedulePaid(projectId, scheduleId, {
      recordPayment: req.body?.record_payment !== false,
      paymentMethod:
        typeof req.body?.payment_method === 'string' ? req.body.payment_method : 'Bank Transfer',
      createdBy: req.user?.userId ?? null,
    });

    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'schedule.marked_paid',
        entity_type: 'PaymentSchedule',
        entity_id: `${result.schedule.project_code}#${result.schedule.id}`,
        source: 'Web',
        details: `Marked "${result.schedule.milestone_title}" (${formatBdtPlain(result.schedule.amount)}) as Paid${
          result.payment ? ` · Issued ${result.payment.invoice_number}` : ''
        }`,
      });
    }

    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteScheduleHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const projectId = Number(req.params.id);
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(projectId) || !Number.isInteger(scheduleId)) {
      res.status(400).json({ error: 'Invalid project or schedule ID.' });
      return;
    }
    await deletePaymentSchedule(projectId, scheduleId);

    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'schedule.deleted',
        entity_type: 'PaymentSchedule',
        entity_id: `PRJ#${projectId}/SCH#${scheduleId}`,
        source: 'Web',
        details: `Deleted payment schedule reminder #${scheduleId}`,
      });
    }

    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}
