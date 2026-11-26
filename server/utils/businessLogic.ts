import crypto from 'node:crypto';

export type UserRole = 'superadmin' | 'employee';
export type CustomerStatus = 'Active' | 'Lead' | 'Inactive';
export type ProjectStatus = 'Pending' | 'In Progress' | 'Review' | 'Completed';
export type NoteCategory = 'Client Discussion' | 'Development' | 'Work/General';
export type TransactionType = 'Income' | 'Expense';
export type ActivitySource = 'Web' | 'MCP';
export type PaymentScheduleStatus = 'Pending' | 'Paid';

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = ['Active', 'Lead', 'Inactive'];
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'Pending',
  'In Progress',
  'Review',
  'Completed',
];
export const NOTE_CATEGORIES: readonly NoteCategory[] = [
  'Client Discussion',
  'Development',
  'Work/General',
];
export const TRANSACTION_TYPES: readonly TransactionType[] = ['Income', 'Expense'];

export interface ProjectFinancialSummary {
  totalBudget: number;
  paidAmount: number;
  dueAmount: number;
  progressPercent: number;
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
}

export interface DashboardKPIs {
  totalCustomers: number;
  activeProjects: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  pendingDues: number;
}

export interface SanitizedMcpProject {
  id: number;
  project_code: string;
  customer_code: string;
  title: string;
  status: ProjectStatus;
  budget: number;
  paid_amount: number;
  due_amount: number;
  progress_percent: number;
  payment_status: 'Unpaid' | 'Partial' | 'Paid';
  start_date: string | null;
  end_date: string | null;
  description: string;
  task_total: number;
  task_completed: number;
}

export interface MonthlyCashflowPoint {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export interface ProjectStatusBreakdownPoint {
  status: ProjectStatus;
  count: number;
  budget: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatBdtPlain(amount: number): string {
  const safe = roundMoney(Number(amount) || 0);
  const formatted = new Intl.NumberFormat('en-BD', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
  return `৳ ${formatted}`;
}

export function parseNextSequenceNumber(codes: string[], prefix: string, startAt: number): number {
  let maxNum = startAt - 1;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const code of codes) {
    const match = pattern.exec(code.trim());
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  return maxNum + 1;
}

export function generateCustomerCode(existingCodes: string[]): string {
  const next = parseNextSequenceNumber(existingCodes, 'CU', 101);
  return `CU-${next}`;
}

export function generateProjectCode(existingCodes: string[]): string {
  const next = parseNextSequenceNumber(existingCodes, 'PRJ', 101);
  return `PRJ-${next}`;
}

export function generateInvoiceNumber(existingNumbers: string[]): string {
  const next = parseNextSequenceNumber(existingNumbers, 'INV', 1001);
  return `INV-${next}`;
}

export function calculateProjectFinancials(
  budget: number,
  payments: Array<{ amount: number }>
): ProjectFinancialSummary {
  const safeBudget = Math.max(0, roundMoney(Number(budget) || 0));
  const paidAmount = roundMoney(
    payments.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0)
  );
  const dueAmount = roundMoney(Math.max(0, safeBudget - paidAmount));
  const progressPercent =
    safeBudget <= 0
      ? paidAmount > 0
        ? 100
        : 0
      : Math.min(100, Math.round((paidAmount / safeBudget) * 100));

  let paymentStatus: 'Unpaid' | 'Partial' | 'Paid' = 'Unpaid';
  if (safeBudget > 0 && dueAmount === 0) {
    paymentStatus = 'Paid';
  } else if (paidAmount > 0) {
    paymentStatus = 'Partial';
  }

  return {
    totalBudget: safeBudget,
    paidAmount,
    dueAmount,
    progressPercent,
    paymentStatus,
  };
}

export function computeDashboardKPIs(
  customers: Array<{ id: number }>,
  projects: Array<{ id: number; status: ProjectStatus; budget: number }>,
  transactions: Array<{ type: TransactionType; amount: number }>,
  payments: Array<{ project_id: number; amount: number }>
): DashboardKPIs {
  const totalCustomers = customers.length;
  const activeProjects = projects.filter(
    (p) => p.status === 'Pending' || p.status === 'In Progress' || p.status === 'Review'
  ).length;

  let totalIncome = 0;
  let totalExpenses = 0;
  for (const tx of transactions) {
    const amt = Math.max(0, Number(tx.amount) || 0);
    if (tx.type === 'Income') {
      totalIncome += amt;
    } else if (tx.type === 'Expense') {
      totalExpenses += amt;
    }
  }

  const paidByProject = new Map<number, number>();
  for (const payment of payments) {
    const prev = paidByProject.get(payment.project_id) ?? 0;
    paidByProject.set(payment.project_id, prev + Math.max(0, Number(payment.amount) || 0));
  }

  let pendingDues = 0;
  for (const project of projects) {
    const paid = paidByProject.get(project.id) ?? 0;
    const due = Math.max(0, (Number(project.budget) || 0) - paid);
    pendingDues += due;
  }

  const roundedIncome = roundMoney(totalIncome);
  const roundedExpenses = roundMoney(totalExpenses);

  return {
    totalCustomers,
    activeProjects,
    totalIncome: roundedIncome,
    totalExpenses: roundedExpenses,
    netBalance: roundMoney(roundedIncome - roundedExpenses),
    pendingDues: roundMoney(pendingDues),
  };
}

export function isScheduleDueOrOverdue(
  dueDate: string,
  status: PaymentScheduleStatus,
  todayIso: string
): boolean {
  if (status !== 'Pending') return false;
  const normalizedDue = dueDate.slice(0, 10);
  const normalizedToday = todayIso.slice(0, 10);
  return Boolean(normalizedDue) && normalizedDue <= normalizedToday;
}

export function sanitizeProjectForMcp<
  T extends {
    id: number;
    project_code: string;
    customer_code: string;
    title: string;
    status: ProjectStatus;
    budget: number;
    paid_amount: number;
    due_amount: number;
    progress_percent: number;
    payment_status: 'Unpaid' | 'Partial' | 'Paid';
    start_date: string | null;
    end_date: string | null;
    description: string;
    task_total: number;
    task_completed: number;
  },
>(project: T): SanitizedMcpProject {
  // Strictly strip all customer PII (name, email, phone, company, notes)
  return {
    id: project.id,
    project_code: project.project_code,
    customer_code: project.customer_code,
    title: project.title,
    status: project.status,
    budget: roundMoney(project.budget),
    paid_amount: roundMoney(project.paid_amount),
    due_amount: roundMoney(project.due_amount),
    progress_percent: project.progress_percent,
    payment_status: project.payment_status,
    start_date: project.start_date,
    end_date: project.end_date,
    description: project.description,
    task_total: project.task_total,
    task_completed: project.task_completed,
  };
}

export function buildMonthlyCashflowSeries(
  transactions: Array<{ type: TransactionType; amount: number; transaction_date: string }>
): MonthlyCashflowPoint[] {
  const buckets = new Map<string, { income: number; expenses: number }>();

  for (const tx of transactions) {
    const monthKey = (tx.transaction_date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    const entry = buckets.get(monthKey) ?? { income: 0, expenses: 0 };
    const amt = Math.max(0, Number(tx.amount) || 0);
    if (tx.type === 'Income') {
      entry.income += amt;
    } else if (tx.type === 'Expense') {
      entry.expenses += amt;
    }
    buckets.set(monthKey, entry);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => {
      const [yearStr, monStr] = month.split('-');
      const d = new Date(Number(yearStr), Number(monStr) - 1, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const income = roundMoney(vals.income);
      const expenses = roundMoney(vals.expenses);
      return {
        month,
        label,
        income,
        expenses,
        net: roundMoney(income - expenses),
      };
    });
}

export function buildProjectStatusBreakdown(
  projects: Array<{ status: ProjectStatus; budget: number }>
): ProjectStatusBreakdownPoint[] {
  return PROJECT_STATUSES.map((status) => {
    const matching = projects.filter((p) => p.status === status);
    return {
      status,
      count: matching.length,
      budget: roundMoney(matching.reduce((s, p) => s + Math.max(0, Number(p.budget) || 0), 0)),
    };
  });
}

export function hashMcpToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function computePkceS256Challenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

export function verifyPkceS256(codeVerifier: string, expectedChallenge: string): boolean {
  if (
    typeof codeVerifier !== 'string' ||
    typeof expectedChallenge !== 'string' ||
    codeVerifier.length < 43 ||
    codeVerifier.length > 128 ||
    expectedChallenge.length < 43 ||
    expectedChallenge.length > 128
  ) {
    return false;
  }
  const computed = computePkceS256Challenge(codeVerifier);
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(expectedChallenge, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function timingSafeHashMatch(rawValue: string, expectedHexHash: string): boolean {
  if (!rawValue || !expectedHexHash || expectedHexHash.length !== 64) {
    return false;
  }
  const computedHex = hashMcpToken(rawValue);
  const a = Buffer.from(computedHex, 'hex');
  const b = Buffer.from(expectedHexHash, 'hex');
  if (a.length !== b.length || a.length !== 32) return false;
  return crypto.timingSafeEqual(a, b);
}

export function validateOAuthRedirectUri(rawUri: string): string | null {
  const trimmed = (rawUri || '').trim();
  if (!trimmed || trimmed.length > 512) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  // OAuth 2.1 forbids URI fragments in redirect_uri
  if (parsed.hash) return null;

  const isHttps = parsed.protocol === 'https:';
  const isLoopbackHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (!isHttps && !isLoopbackHttp) {
    return null;
  }
  return trimmed;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePositiveAmount(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return roundMoney(num);
}

export function validateNonNegativeAmount(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return roundMoney(num);
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'superadmin';
}

export function canDeleteRecords(role: UserRole): boolean {
  return role === 'superadmin';
}

export function canViewAllAuditLogs(role: UserRole): boolean {
  return role === 'superadmin';
}
