import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type ProjectPaymentRecord,
  type TransactionRecord,
} from '../config/db';
import {
  TRANSACTION_TYPES,
  calculateProjectFinancials,
  generateInvoiceNumber,
  validatePositiveAmount,
  type TransactionType,
} from '../utils/businessLogic';
import { ServiceError } from './customerService';

export interface PaymentWithMeta extends ProjectPaymentRecord {
  project_title: string;
  project_code: string;
  project_budget: number;
  customer_name: string;
  customer_company: string;
  customer_code: string;
  customer_email: string;
  customer_phone: string;
}

export interface InvoiceDetail {
  invoice_number: string;
  payment_id: number;
  milestone_title: string;
  payment_amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  project_code: string;
  project_title: string;
  project_budget: number;
  project_paid_total: number;
  project_due_total: number;
  customer_code: string;
  customer_name: string;
  customer_company: string;
  customer_email: string;
  customer_phone: string;
  agency: {
    name: string;
    tagline: string;
    email: string;
    website: string;
  };
}

export async function listTransactions(filters?: {
  type?: string;
  search?: string;
}): Promise<TransactionRecord[]> {
  const typeFilter = filters?.type?.trim() || '';
  const search = filters?.search?.trim().toLowerCase() || '';

  if (isMysqlMode()) {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (typeFilter && typeFilter !== 'All') {
      conditions.push('type = ?');
      params.push(typeFilter);
    }
    if (search) {
      conditions.push('(LOWER(category) LIKE ? OR LOWER(description) LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT * FROM transactions ${whereClause} ORDER BY transaction_date DESC, id DESC`,
      params
    );
    return rows.map((row) => ({
      ...(row as TransactionRecord),
      amount: Number(row.amount),
    }));
  }

  return memoryStore.transactions
    .filter((tx) => {
      if (typeFilter && typeFilter !== 'All' && tx.type !== typeFilter) return false;
      if (
        search &&
        !tx.category.toLowerCase().includes(search) &&
        !tx.description.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);
}

export async function createTransaction(input: {
  type: TransactionType;
  category: string;
  amount: number;
  transaction_date: string;
  description?: string;
  project_id?: number | null;
  created_by?: number | null;
}): Promise<TransactionRecord> {
  if (!TRANSACTION_TYPES.includes(input.type)) {
    throw new ServiceError('Transaction type must be Income or Expense.', 400);
  }
  const category = input.category?.trim();
  if (!category) throw new ServiceError('Category is required.', 400);

  const amount = validatePositiveAmount(input.amount);
  if (amount === null) throw new ServiceError('Amount must be greater than 0.', 400);

  const date = input.transaction_date?.trim() || new Date().toISOString().slice(0, 10);
  const description = input.description?.trim() || '';
  const projectId = input.project_id ? Number(input.project_id) : null;
  const createdBy = input.created_by ?? null;

  if (isMysqlMode()) {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO transactions (type, category, amount, transaction_date, description, project_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.type, category, amount, date, description, projectId, createdBy]
    );
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM transactions WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    const row = rows[0] as TransactionRecord;
    return { ...row, amount: Number(row.amount) };
  }

  const created: TransactionRecord = {
    id: memoryStore.seq.transactions++,
    type: input.type,
    category,
    amount,
    transaction_date: date,
    description,
    project_id: projectId,
    payment_id: null,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  memoryStore.transactions.push(created);
  return created;
}

export async function deleteTransaction(id: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM transactions WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) throw new ServiceError('Transaction not found.', 404);
    return;
  }

  const idx = memoryStore.transactions.findIndex((tx) => tx.id === id);
  if (idx === -1) throw new ServiceError('Transaction not found.', 404);
  memoryStore.transactions.splice(idx, 1);
}

export async function listPayments(projectId?: number): Promise<PaymentWithMeta[]> {
  if (isMysqlMode()) {
    const whereClause = projectId ? 'WHERE pp.project_id = ?' : '';
    const params = projectId ? [projectId] : [];
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT pp.*,
        p.title AS project_title,
        p.project_code AS project_code,
        p.budget AS project_budget,
        c.name AS customer_name,
        c.company AS customer_company,
        c.customer_code AS customer_code,
        c.email AS customer_email,
        c.phone AS customer_phone
       FROM project_payments pp
       INNER JOIN projects p ON p.id = pp.project_id
       INNER JOIN customers c ON c.id = p.customer_id
       ${whereClause}
       ORDER BY pp.payment_date DESC, pp.id DESC`,
      params
    );

    return rows.map((row) => ({
      ...(row as ProjectPaymentRecord),
      amount: Number(row.amount),
      project_title: String(row.project_title),
      project_code: String(row.project_code),
      project_budget: Number(row.project_budget),
      customer_name: String(row.customer_name),
      customer_company: String(row.customer_company || ''),
      customer_code: String(row.customer_code),
      customer_email: String(row.customer_email || ''),
      customer_phone: String(row.customer_phone || ''),
    }));
  }

  return memoryStore.projectPayments
    .filter((pm) => (!projectId ? true : pm.project_id === projectId))
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id - a.id)
    .map((pm) => {
      const project = memoryStore.projects.find((p) => p.id === pm.project_id);
      const customer = project
        ? memoryStore.customers.find((c) => c.id === project.customer_id)
        : undefined;
      return {
        ...pm,
        project_title: project?.title || 'Deleted Project',
        project_code: project?.project_code || 'PRJ-000',
        project_budget: project?.budget ?? 0,
        customer_name: customer?.name || 'Unknown Customer',
        customer_company: customer?.company || '',
        customer_code: customer?.customer_code || 'CU-000',
        customer_email: customer?.email || '',
        customer_phone: customer?.phone || '',
      };
    });
}

export async function recordProjectPayment(input: {
  project_id: number;
  milestone_title: string;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  notes?: string;
  created_by?: number | null;
}): Promise<PaymentWithMeta> {
  const projectId = Number(input.project_id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new ServiceError('A valid project is required.', 400);
  }
  const milestoneTitle = input.milestone_title?.trim();
  if (!milestoneTitle) throw new ServiceError('Milestone or payment title is required.', 400);

  const amount = validatePositiveAmount(input.amount);
  if (amount === null) throw new ServiceError('Payment amount must be greater than 0.', 400);

  const paymentDate = input.payment_date?.trim() || new Date().toISOString().slice(0, 10);
  const paymentMethod = input.payment_method?.trim() || 'Bank Transfer';
  const notes = input.notes?.trim() || '';
  const createdBy = input.created_by ?? null;

  if (isMysqlMode()) {
    const pool = getPool();
    const [projRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, title FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    if (projRows.length === 0) throw new ServiceError('Project not found.', 404);
    const projectTitle = String(projRows[0].title);

    const [invRows] = await pool.execute<RowDataPacket[]>(
      'SELECT invoice_number FROM project_payments'
    );
    const invoiceNumber = generateInvoiceNumber(invRows.map((r) => String(r.invoice_number)));

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO project_payments (invoice_number, project_id, milestone_title, amount, payment_date, payment_method, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, projectId, milestoneTitle, amount, paymentDate, paymentMethod, notes]
    );

    const paymentId = result.insertId;
    await pool.execute(
      `INSERT INTO transactions (type, category, amount, transaction_date, description, project_id, payment_id, created_by)
       VALUES ('Income', 'Project Payment', ?, ?, ?, ?, ?, ?)`,
      [
        amount,
        paymentDate,
        `${invoiceNumber} · ${projectTitle} (${milestoneTitle})`,
        projectId,
        paymentId,
        createdBy,
      ]
    );

    const all = await listPayments(projectId);
    const created = all.find((p) => p.id === paymentId);
    if (!created) throw new ServiceError('Failed to load created payment.', 500);
    return created;
  }

  const project = memoryStore.projects.find((p) => p.id === projectId);
  if (!project) throw new ServiceError('Project not found.', 404);

  const invoiceNumber = generateInvoiceNumber(
    memoryStore.projectPayments.map((pm) => pm.invoice_number)
  );
  const now = new Date().toISOString();
  const payment: ProjectPaymentRecord = {
    id: memoryStore.seq.projectPayments++,
    invoice_number: invoiceNumber,
    project_id: projectId,
    milestone_title: milestoneTitle,
    amount,
    payment_date: paymentDate,
    payment_method: paymentMethod,
    notes,
    created_at: now,
  };
  memoryStore.projectPayments.push(payment);

  memoryStore.transactions.push({
    id: memoryStore.seq.transactions++,
    type: 'Income',
    category: 'Project Payment',
    amount,
    transaction_date: paymentDate,
    description: `${invoiceNumber} · ${project.title} (${milestoneTitle})`,
    project_id: projectId,
    payment_id: payment.id,
    created_by: createdBy,
    created_at: now,
  });

  const all = await listPayments(projectId);
  const created = all.find((p) => p.id === payment.id);
  if (!created) throw new ServiceError('Failed to load created payment.', 500);
  return created;
}

export async function deleteProjectPayment(paymentId: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM project_payments WHERE id = ?',
      [paymentId]
    );
    if (result.affectedRows === 0) throw new ServiceError('Payment not found.', 404);
    return;
  }

  const idx = memoryStore.projectPayments.findIndex((pm) => pm.id === paymentId);
  if (idx === -1) throw new ServiceError('Payment not found.', 404);
  memoryStore.projectPayments.splice(idx, 1);
  memoryStore.transactions = memoryStore.transactions.filter((tx) => tx.payment_id !== paymentId);
}

export async function getInvoiceByPaymentId(paymentId: number): Promise<InvoiceDetail | null> {
  const allPayments = await listPayments();
  const payment = allPayments.find((pm) => pm.id === paymentId);
  if (!payment) return null;

  const projectPayments = allPayments.filter((pm) => pm.project_id === payment.project_id);
  const fin = calculateProjectFinancials(payment.project_budget, projectPayments);

  return {
    invoice_number: payment.invoice_number,
    payment_id: payment.id,
    milestone_title: payment.milestone_title,
    payment_amount: payment.amount,
    payment_date: payment.payment_date,
    payment_method: payment.payment_method,
    notes: payment.notes,
    project_code: payment.project_code,
    project_title: payment.project_title,
    project_budget: fin.totalBudget,
    project_paid_total: fin.paidAmount,
    project_due_total: fin.dueAmount,
    customer_code: payment.customer_code,
    customer_name: payment.customer_name,
    customer_company: payment.customer_company,
    customer_email: payment.customer_email,
    customer_phone: payment.customer_phone,
    agency: {
      name: 'GrowDeshIT',
      tagline: 'Digital Engineering & Agency Operations',
      email: 'billing@growdeshit.com',
      website: 'growdeshit.com',
    },
  };
}
