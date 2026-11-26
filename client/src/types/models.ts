export type UserRole = 'superadmin' | 'employee';
export type CustomerStatus = 'Active' | 'Lead' | 'Inactive';
export type ProjectStatus = 'Pending' | 'In Progress' | 'Review' | 'Completed';
export type NoteCategory = 'Client Discussion' | 'Development' | 'Work/General';
export type TransactionType = 'Income' | 'Expense';
export type ActivitySource = 'Web' | 'MCP';
export type PaymentScheduleStatus = 'Pending' | 'Paid';

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
}

export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  status: CustomerStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  project_count?: number;
  total_budget?: number;
}

export interface CustomerLinkedProject {
  id: number;
  project_code: string;
  customer_id: number;
  title: string;
  status: ProjectStatus;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  description: string;
  paid_amount: number;
  due_amount: number;
  payment_status: 'Unpaid' | 'Partial' | 'Paid';
}

export interface CustomerDetail extends Customer {
  projects: CustomerLinkedProject[];
}

export interface ProjectSummary {
  id: number;
  project_code: string;
  customer_id: number;
  title: string;
  status: ProjectStatus;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  description: string;
  created_at: string;
  updated_at: string;
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

export interface ProjectTask {
  id: number;
  project_id: number;
  title: string;
  assignee_name: string;
  assignee_id: number | null;
  is_completed: boolean;
  due_date: string | null;
  created_at: string;
}

export interface ProjectNote {
  id: number;
  project_id: number;
  category: NoteCategory;
  content: string;
  author_name: string;
  author_id: number | null;
  created_at: string;
}

export interface ProjectPayment {
  id: number;
  invoice_number: string;
  project_id: number;
  milestone_title: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface PaymentSchedule {
  id: number;
  project_id: number;
  milestone_title: string;
  amount: number;
  due_date: string;
  status: PaymentScheduleStatus;
  paid_payment_id: number | null;
  notes: string;
  created_at: string;
  project_code?: string;
  project_title?: string;
  customer_code?: string;
}

export interface ProjectDetail extends ProjectSummary {
  customer_email: string;
  customer_phone: string;
  tasks: ProjectTask[];
  notes: ProjectNote[];
  payments: ProjectPayment[];
  schedules: PaymentSchedule[];
}

export interface PaymentWithMeta extends ProjectPayment {
  project_title: string;
  project_code: string;
  project_budget: number;
  customer_name: string;
  customer_company: string;
  customer_code: string;
  customer_email: string;
  customer_phone: string;
}

export interface Transaction {
  id: number;
  type: TransactionType;
  category: string;
  amount: number;
  transaction_date: string;
  description: string;
  project_id: number | null;
  payment_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface DashboardKPIs {
  totalCustomers: number;
  activeProjects: number;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  pendingDues: number;
}

export interface DashboardOverview {
  kpis: DashboardKPIs;
  recentProjects: ProjectSummary[];
  recentPayments: PaymentWithMeta[];
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

export interface AppNotification {
  id: number;
  type: 'payment_due' | 'system';
  title: string;
  message: string;
  project_id: number | null;
  schedule_id: number | null;
  amount: number | null;
  due_date: string | null;
  is_read: boolean;
  created_at: string;
  project_code: string | null;
  project_title: string | null;
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

export interface PendingBalanceRow {
  id: number;
  project_code: string;
  title: string;
  customer_code: string;
  customer_name: string;
  customer_company: string;
  status: ProjectStatus;
  budget: number;
  paid_amount: number;
  due_amount: number;
  progress_percent: number;
}

export interface FinancialReport {
  filters: {
    month: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  currency: 'BDT';
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    pendingDues: number;
    totalBudget: number;
    totalCollected: number;
    activeProjects: number;
    completedProjects: number;
    totalProjects: number;
  };
  monthlyCashflow: MonthlyCashflowPoint[];
  projectStatusBreakdown: ProjectStatusBreakdownPoint[];
  expenseByCategory: Array<{ category: string; amount: number }>;
  pendingBalances: PendingBalanceRow[];
}

export interface ActivityLog {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: UserRole | 'system';
  action: string;
  entity_type: string;
  entity_id: string;
  source: ActivitySource;
  details: string;
  created_at: string;
}

export interface McpToken {
  id: number;
  user_id: number;
  label: string;
  token_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface McpOAuthClient {
  id: number;
  name: string;
  client_id: string;
  redirect_uris: string[];
  created_by: number | null;
  is_active: boolean;
  created_at: string;
}
