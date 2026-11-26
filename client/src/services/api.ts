import type {
  ActivityLog,
  AppNotification,
  Customer,
  CustomerDetail,
  CustomerStatus,
  DashboardOverview,
  FinancialReport,
  InvoiceDetail,
  McpOAuthClient,
  McpToken,
  NoteCategory,
  PaymentSchedule,
  PaymentWithMeta,
  ProjectDetail,
  ProjectNote,
  ProjectStatus,
  ProjectSummary,
  ProjectTask,
  Transaction,
  TransactionType,
  User,
  UserRole,
} from '../types/models';

let authTokenMemory: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setApiAuthToken(token: string | null): void {
  authTokenMemory = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorizedCallback = handler;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (authTokenMemory) {
    headers.Authorization = `Bearer ${authTokenMemory}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && authTokenMemory && onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
    const message =
      (payload && typeof payload.error === 'string' && payload.error) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  // Auth & Team
  login: (body: { identifier: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getMe: () => request<{ user: User }>('/api/auth/me'),
  listUsers: () => request<{ users: User[] }>('/api/auth/users'),
  createUser: (body: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
  }) =>
    request<{ user: User }>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteUser: (id: number) =>
    request<{ deleted: boolean }>(`/api/auth/users/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboard: () => request<DashboardOverview>('/api/dashboard'),

  // Notifications
  listNotifications: () =>
    request<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),
  markNotificationRead: (id: number) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/api/notifications/read-all', { method: 'PATCH' }),

  // Customers
  listCustomers: (params?: { search?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    const qs = query.toString();
    return request<{ customers: Customer[] }>(`/api/customers${qs ? `?${qs}` : ''}`);
  },
  getCustomer: (id: number) => request<{ customer: CustomerDetail }>(`/api/customers/${id}`),
  createCustomer: (body: {
    name: string;
    company?: string;
    phone?: string;
    email?: string;
    status?: CustomerStatus;
    notes?: string;
  }) =>
    request<{ customer: Customer }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCustomer: (
    id: number,
    body: Partial<{
      name: string;
      company: string;
      phone: string;
      email: string;
      status: CustomerStatus;
      notes: string;
    }>
  ) =>
    request<{ customer: Customer }>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteCustomer: (id: number) =>
    request<{ deleted: boolean }>(`/api/customers/${id}`, { method: 'DELETE' }),

  // Projects, Tasks, Categorized Notes & Payment Schedules
  listProjects: (params?: { status?: string; search?: string; customerId?: number }) => {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.customerId) query.set('customerId', String(params.customerId));
    const qs = query.toString();
    return request<{ projects: ProjectSummary[] }>(`/api/projects${qs ? `?${qs}` : ''}`);
  },
  getProject: (id: number) => request<{ project: ProjectDetail }>(`/api/projects/${id}`),
  createProject: (body: {
    customer_id: number;
    title: string;
    status?: ProjectStatus;
    budget: number;
    start_date?: string | null;
    end_date?: string | null;
    description?: string;
  }) =>
    request<{ project: ProjectSummary }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProject: (
    id: number,
    body: Partial<{
      customer_id: number;
      title: string;
      status: ProjectStatus;
      budget: number;
      start_date: string | null;
      end_date: string | null;
      description: string;
    }>
  ) =>
    request<{ project: ProjectSummary }>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteProject: (id: number) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  addTask: (
    projectId: number,
    body: { title: string; assignee_name?: string; due_date?: string | null }
  ) =>
    request<{ task: ProjectTask }>(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  toggleTask: (projectId: number, taskId: number, isCompleted: boolean) =>
    request<{ task: ProjectTask }>(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_completed: isCompleted }),
    }),
  deleteTask: (projectId: number, taskId: number) =>
    request<{ deleted: boolean }>(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  addNote: (projectId: number, body: { category: NoteCategory; content: string }) =>
    request<{ note: ProjectNote }>(`/api/projects/${projectId}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteNote: (projectId: number, noteId: number) =>
    request<{ deleted: boolean }>(`/api/projects/${projectId}/notes/${noteId}`, {
      method: 'DELETE',
    }),

  createPaymentSchedule: (
    projectId: number,
    body: { milestone_title: string; amount: number; due_date: string; notes?: string }
  ) =>
    request<{ schedule: PaymentSchedule }>(`/api/projects/${projectId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  markSchedulePaid: (
    projectId: number,
    scheduleId: number,
    body?: { record_payment?: boolean; payment_method?: string }
  ) =>
    request<{ schedule: PaymentSchedule; payment: PaymentWithMeta | null }>(
      `/api/projects/${projectId}/schedules/${scheduleId}/pay`,
      {
        method: 'PATCH',
        body: JSON.stringify(body || { record_payment: true }),
      }
    ),
  deletePaymentSchedule: (projectId: number, scheduleId: number) =>
    request<{ success: boolean }>(`/api/projects/${projectId}/schedules/${scheduleId}`, {
      method: 'DELETE',
    }),

  // Finance & Invoicing
  listTransactions: (params?: { type?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.type && params.type !== 'All') query.set('type', params.type);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return request<{ transactions: Transaction[] }>(
      `/api/finance/transactions${qs ? `?${qs}` : ''}`
    );
  },
  createTransaction: (body: {
    type: TransactionType;
    category: string;
    amount: number;
    transaction_date: string;
    description?: string;
    project_id?: number | null;
  }) =>
    request<{ transaction: Transaction }>('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteTransaction: (id: number) =>
    request<{ deleted: boolean }>(`/api/finance/transactions/${id}`, { method: 'DELETE' }),

  listPayments: (projectId?: number) => {
    const qs = projectId ? `?projectId=${projectId}` : '';
    return request<{ payments: PaymentWithMeta[] }>(`/api/finance/payments${qs}`);
  },
  recordPayment: (body: {
    project_id: number;
    milestone_title: string;
    amount: number;
    payment_date?: string;
    payment_method?: string;
    notes?: string;
  }) =>
    request<{ payment: PaymentWithMeta }>('/api/finance/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletePayment: (id: number) =>
    request<{ deleted: boolean }>(`/api/finance/payments/${id}`, { method: 'DELETE' }),

  getInvoice: (paymentId: number) =>
    request<{ invoice: InvoiceDetail }>(`/api/finance/invoices/${paymentId}`),

  // Reports
  getReports: (params?: { month?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.month) query.set('month', params.month);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return request<FinancialReport>(`/api/reports${qs ? `?${qs}` : ''}`);
  },

  // Activity Logs
  listAuditLogs: (params?: { search?: string; source?: string; entity_type?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.source && params.source !== 'All') query.set('source', params.source);
    if (params?.entity_type && params.entity_type !== 'All') {
      query.set('entity_type', params.entity_type);
    }
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ logs: ActivityLog[]; scope: 'all' | 'personal' }>(
      `/api/audit-logs${qs ? `?${qs}` : ''}`
    );
  },

  // Personal MCP Access Tokens
  listMcpTokens: () => request<{ tokens: McpToken[] }>('/api/mcp/tokens'),
  createMcpToken: (label: string) =>
    request<{ token: McpToken; rawToken: string }>('/api/mcp/tokens', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  revokeMcpToken: (id: number) =>
    request<{ success: boolean }>(`/api/mcp/tokens/${id}`, { method: 'DELETE' }),

  // MCP OAuth 2.1 Clients (Superadmin)
  listOAuthClients: () =>
    request<{ clients: McpOAuthClient[]; mcpServerUrl: string; appUrl: string }>(
      '/api/mcp/oauth-clients'
    ),
  createOAuthClient: (body: { name: string; redirect_uri: string }) =>
    request<{ client: McpOAuthClient; clientSecret: string; mcpServerUrl: string }>(
      '/api/mcp/oauth-clients',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    ),
  revokeOAuthClient: (id: number) =>
    request<{ success: boolean }>(`/api/mcp/oauth-clients/${id}`, { method: 'DELETE' }),
};
