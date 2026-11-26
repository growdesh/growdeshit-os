import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import {
  getPool,
  isMysqlMode,
  memoryStore,
  type CustomerRecord,
  type ProjectRecord,
} from '../config/db';
import {
  CUSTOMER_STATUSES,
  calculateProjectFinancials,
  generateCustomerCode,
  type CustomerStatus,
} from '../utils/businessLogic';

export interface CustomerWithStats extends CustomerRecord {
  project_count: number;
  total_budget: number;
}

export interface CustomerDetail extends CustomerRecord {
  projects: Array<
    ProjectRecord & {
      paid_amount: number;
      due_amount: number;
      payment_status: 'Unpaid' | 'Partial' | 'Paid';
    }
  >;
}

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function listCustomers(filters?: {
  search?: string;
  status?: string;
}): Promise<CustomerWithStats[]> {
  const search = filters?.search?.trim().toLowerCase() || '';
  const statusFilter = filters?.status?.trim() || '';

  if (isMysqlMode()) {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (statusFilter && statusFilter !== 'All') {
      conditions.push('c.status = ?');
      params.push(statusFilter);
    }
    if (search) {
      conditions.push(
        '(LOWER(c.name) LIKE ? OR LOWER(c.company) LIKE ? OR LOWER(c.customer_code) LIKE ? OR LOWER(c.email) LIKE ? OR LOWER(c.phone) LIKE ?)'
      );
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT c.*,
        COUNT(p.id) AS project_count,
        COALESCE(SUM(p.budget), 0) AS total_budget
       FROM customers c
       LEFT JOIN projects p ON p.customer_id = c.id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.id DESC`,
      params
    );

    return rows.map((row) => ({
      ...(row as CustomerRecord),
      project_count: Number(row.project_count ?? 0),
      total_budget: Number(row.total_budget ?? 0),
    }));
  }

  return memoryStore.customers
    .filter((c) => {
      if (statusFilter && statusFilter !== 'All' && c.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return (
        c.name.toLowerCase().includes(search) ||
        c.company.toLowerCase().includes(search) ||
        c.customer_code.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.phone.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => b.id - a.id)
    .map((c) => {
      const linked = memoryStore.projects.filter((p) => p.customer_id === c.id);
      return {
        ...c,
        project_count: linked.length,
        total_budget: linked.reduce((sum, p) => sum + Number(p.budget || 0), 0),
      };
    });
}

export async function getCustomerById(id: number): Promise<CustomerDetail | null> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM customers WHERE id = ? LIMIT 1',
      [id]
    );
    const customer = rows[0] as CustomerRecord | undefined;
    if (!customer) return null;

    const [projectRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM projects WHERE customer_id = ? ORDER BY id DESC',
      [id]
    );
    const [paymentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT pp.project_id, pp.amount
       FROM project_payments pp
       INNER JOIN projects p ON p.id = pp.project_id
       WHERE p.customer_id = ?`,
      [id]
    );

    const payments = paymentRows as Array<{ project_id: number; amount: number }>;
    const projects = (projectRows as ProjectRecord[]).map((p) => {
      const fin = calculateProjectFinancials(
        Number(p.budget),
        payments.filter((pm) => pm.project_id === p.id)
      );
      return {
        ...p,
        budget: Number(p.budget),
        paid_amount: fin.paidAmount,
        due_amount: fin.dueAmount,
        payment_status: fin.paymentStatus,
      };
    });

    return { ...customer, projects };
  }

  const customer = memoryStore.customers.find((c) => c.id === id);
  if (!customer) return null;

  const projects = memoryStore.projects
    .filter((p) => p.customer_id === id)
    .sort((a, b) => b.id - a.id)
    .map((p) => {
      const pPayments = memoryStore.projectPayments.filter((pm) => pm.project_id === p.id);
      const fin = calculateProjectFinancials(p.budget, pPayments);
      return {
        ...p,
        paid_amount: fin.paidAmount,
        due_amount: fin.dueAmount,
        payment_status: fin.paymentStatus,
      };
    });

  return { ...customer, projects };
}

export async function createCustomer(input: {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  status?: CustomerStatus;
  notes?: string;
}): Promise<CustomerRecord> {
  const name = input.name?.trim();
  if (!name) {
    throw new ServiceError('Customer name is required.', 400);
  }

  const company = input.company?.trim() || '';
  const phone = input.phone?.trim() || '';
  const email = input.email?.trim() || '';
  const status: CustomerStatus = CUSTOMER_STATUSES.includes(input.status as CustomerStatus)
    ? (input.status as CustomerStatus)
    : 'Active';
  const notes = input.notes?.trim() || '';

  if (isMysqlMode()) {
    const pool = getPool();
    const [codeRows] = await pool.execute<RowDataPacket[]>(
      'SELECT customer_code FROM customers'
    );
    const customerCode = generateCustomerCode(
      codeRows.map((r) => String(r.customer_code))
    );

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO customers (customer_code, name, company, phone, email, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerCode, name, company, phone, email, status, notes]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM customers WHERE id = ? LIMIT 1',
      [result.insertId]
    );
    return rows[0] as CustomerRecord;
  }

  const customerCode = generateCustomerCode(memoryStore.customers.map((c) => c.customer_code));
  const now = new Date().toISOString();
  const created: CustomerRecord = {
    id: memoryStore.seq.customers++,
    customer_code: customerCode,
    name,
    company,
    phone,
    email,
    status,
    notes,
    created_at: now,
    updated_at: now,
  };
  memoryStore.customers.push(created);
  return created;
}

export async function updateCustomer(
  id: number,
  input: {
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
    status?: CustomerStatus;
    notes?: string;
  }
): Promise<CustomerRecord> {
  if (isMysqlMode()) {
    const pool = getPool();
    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM customers WHERE id = ? LIMIT 1',
      [id]
    );
    const existing = existingRows[0] as CustomerRecord | undefined;
    if (!existing) {
      throw new ServiceError('Customer not found.', 404);
    }

    const name = input.name !== undefined ? input.name.trim() : existing.name;
    if (!name) throw new ServiceError('Customer name cannot be empty.', 400);

    const company = input.company !== undefined ? input.company.trim() : existing.company;
    const phone = input.phone !== undefined ? input.phone.trim() : existing.phone;
    const email = input.email !== undefined ? input.email.trim() : existing.email;
    const status =
      input.status && CUSTOMER_STATUSES.includes(input.status) ? input.status : existing.status;
    const notes = input.notes !== undefined ? input.notes.trim() : existing.notes;

    await pool.execute(
      `UPDATE customers SET name = ?, company = ?, phone = ?, email = ?, status = ?, notes = ? WHERE id = ?`,
      [name, company, phone, email, status, notes, id]
    );

    const [updatedRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM customers WHERE id = ? LIMIT 1',
      [id]
    );
    return updatedRows[0] as CustomerRecord;
  }

  const customer = memoryStore.customers.find((c) => c.id === id);
  if (!customer) {
    throw new ServiceError('Customer not found.', 404);
  }

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ServiceError('Customer name cannot be empty.', 400);
    customer.name = trimmed;
  }
  if (input.company !== undefined) customer.company = input.company.trim();
  if (input.phone !== undefined) customer.phone = input.phone.trim();
  if (input.email !== undefined) customer.email = input.email.trim();
  if (input.status && CUSTOMER_STATUSES.includes(input.status)) customer.status = input.status;
  if (input.notes !== undefined) customer.notes = input.notes.trim();
  customer.updated_at = new Date().toISOString();

  return customer;
}

export async function deleteCustomer(id: number): Promise<void> {
  if (isMysqlMode()) {
    const [result] = await getPool().execute<ResultSetHeader>(
      'DELETE FROM customers WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      throw new ServiceError('Customer not found.', 404);
    }
    return;
  }

  const idx = memoryStore.customers.findIndex((c) => c.id === id);
  if (idx === -1) {
    throw new ServiceError('Customer not found.', 404);
  }
  memoryStore.customers.splice(idx, 1);

  const removedProjectIds = new Set(
    memoryStore.projects.filter((p) => p.customer_id === id).map((p) => p.id)
  );
  memoryStore.projects = memoryStore.projects.filter((p) => p.customer_id !== id);
  memoryStore.projectTasks = memoryStore.projectTasks.filter((t) => !removedProjectIds.has(t.project_id));
  memoryStore.projectNotes = memoryStore.projectNotes.filter((n) => !removedProjectIds.has(n.project_id));
  const removedPaymentIds = new Set(
    memoryStore.projectPayments.filter((pm) => removedProjectIds.has(pm.project_id)).map((pm) => pm.id)
  );
  memoryStore.projectPayments = memoryStore.projectPayments.filter(
    (pm) => !removedProjectIds.has(pm.project_id)
  );
  memoryStore.transactions = memoryStore.transactions.filter(
    (tx) => !(tx.payment_id && removedPaymentIds.has(tx.payment_id))
  );
}
