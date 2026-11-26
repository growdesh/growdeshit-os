import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { logActivity } from '../services/auditService';
import { ServiceError } from '../services/customerService';
import {
  createTransaction,
  deleteProjectPayment,
  deleteTransaction,
  getInvoiceByPaymentId,
  listPayments,
  listTransactions,
  recordProjectPayment,
} from '../services/financeService';
import { formatBdtPlain } from '../utils/businessLogic';

function handleServiceError(res: Response, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[FinanceController]', error);
  res.status(500).json({ error: 'Failed to process finance request.' });
}

export async function listTransactionsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const transactions = await listTransactions({ type, search });
    res.json({ transactions });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function createTransactionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const transaction = await createTransaction({
      ...req.body,
      created_by: req.user?.userId ?? null,
    });
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'transaction.created',
        entity_type: 'Finance',
        entity_id: `TX-${transaction.id}`,
        source: 'Web',
        details: `Logged ${transaction.type} of ${formatBdtPlain(transaction.amount)} (${transaction.category})`,
      });
    }
    res.status(201).json({ transaction });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deleteTransactionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid transaction ID.' });
      return;
    }
    await deleteTransaction(id);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'transaction.deleted',
        entity_type: 'Finance',
        entity_id: `TX-${id}`,
        source: 'Web',
        details: `Deleted ledger transaction TX-${id}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function listPaymentsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const payments = await listPayments(projectId);
    res.json({ payments });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function recordPaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const payment = await recordProjectPayment({
      ...req.body,
      created_by: req.user?.userId ?? null,
    });
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'payment.recorded',
        entity_type: 'Payment',
        entity_id: payment.invoice_number,
        source: 'Web',
        details: `Recorded ${formatBdtPlain(payment.amount)} for ${payment.project_code} (${payment.milestone_title})`,
      });
    }
    res.status(201).json({ payment });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function deletePaymentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid payment ID.' });
      return;
    }
    await deleteProjectPayment(id);
    if (req.user) {
      await logActivity({
        user_id: req.user.userId,
        user_name: req.user.name,
        user_role: req.user.role,
        action: 'payment.deleted',
        entity_type: 'Payment',
        entity_id: `PAY-${id}`,
        source: 'Web',
        details: `Deleted payment record PAY-${id}`,
      });
    }
    res.json({ deleted: true });
  } catch (error) {
    handleServiceError(res, error);
  }
}

export async function getInvoiceHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      res.status(400).json({ error: 'Invalid invoice payment ID.' });
      return;
    }
    const invoice = await getInvoiceByPaymentId(paymentId);
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }
    res.json({ invoice });
  } catch (error) {
    handleServiceError(res, error);
  }
}
