import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DEFAULT_SUPERADMIN, seedMemoryDefaultSuperadmin } from '../database/bootstrap';
import type { MemoryStore } from '../config/db';
import {
  buildMonthlyCashflowSeries,
  buildProjectStatusBreakdown,
  calculateProjectFinancials,
  canDeleteRecords,
  canManageUsers,
  canViewAllAuditLogs,
  computeDashboardKPIs,
  computePkceS256Challenge,
  escapeHtml,
  formatBdtPlain,
  generateCustomerCode,
  generateInvoiceNumber,
  generateProjectCode,
  hashMcpToken,
  isScheduleDueOrOverdue,
  sanitizeProjectForMcp,
  timingSafeHashMatch,
  validateNonNegativeAmount,
  validateOAuthRedirectUri,
  validatePositiveAmount,
  verifyPkceS256,
} from './businessLogic';

test('auto-generated IDs start at configured baselines and increment monotonically', () => {
  assert.equal(generateCustomerCode([]), 'CU-101');
  assert.equal(generateCustomerCode(['CU-101', 'CU-104', 'CU-102']), 'CU-105');

  assert.equal(generateProjectCode([]), 'PRJ-101');
  assert.equal(generateProjectCode(['PRJ-101', 'PRJ-103']), 'PRJ-104');

  assert.equal(generateInvoiceNumber([]), 'INV-1001');
  assert.equal(generateInvoiceNumber(['INV-1001', 'INV-1005']), 'INV-1006');
});

test('calculateProjectFinancials computes paid, due, progress, and payment status accurately', () => {
  const unpaid = calculateProjectFinancials(50000, []);
  assert.deepEqual(unpaid, {
    totalBudget: 50000,
    paidAmount: 0,
    dueAmount: 50000,
    progressPercent: 0,
    paymentStatus: 'Unpaid',
  });

  const partial = calculateProjectFinancials(45000, [{ amount: 15000 }, { amount: 5000 }]);
  assert.deepEqual(partial, {
    totalBudget: 45000,
    paidAmount: 20000,
    dueAmount: 25000,
    progressPercent: 44,
    paymentStatus: 'Partial',
  });

  const overpaid = calculateProjectFinancials(30000, [{ amount: 35000 }]);
  assert.deepEqual(overpaid, {
    totalBudget: 30000,
    paidAmount: 35000,
    dueAmount: 0,
    progressPercent: 100,
    paymentStatus: 'Paid',
  });
});

test('computeDashboardKPIs aggregates totals, active projects, income, expenses, and pending dues', () => {
  const kpis = computeDashboardKPIs(
    [{ id: 1 }, { id: 2 }, { id: 3 }],
    [
      { id: 10, status: 'In Progress', budget: 40000 },
      { id: 11, status: 'Review', budget: 25000 },
      { id: 12, status: 'Completed', budget: 18000 },
    ],
    [
      { type: 'Income', amount: 20000 },
      { type: 'Income', amount: 18000 },
      { type: 'Expense', amount: 6500.5 },
    ],
    [
      { project_id: 10, amount: 20000 },
      { project_id: 12, amount: 18000 },
    ]
  );

  assert.equal(kpis.totalCustomers, 3);
  assert.equal(kpis.activeProjects, 2);
  assert.equal(kpis.totalIncome, 38000);
  assert.equal(kpis.totalExpenses, 6500.5);
  assert.equal(kpis.netBalance, 31499.5);
  assert.equal(kpis.pendingDues, 45000);
});

test('payment schedule due/overdue detection triggers strictly for due or overdue pending items', () => {
  assert.equal(isScheduleDueOrOverdue('2026-11-25', 'Pending', '2026-11-25'), true);
  assert.equal(isScheduleDueOrOverdue('2026-11-20', 'Pending', '2026-11-25'), true);
  assert.equal(isScheduleDueOrOverdue('2026-12-01', 'Pending', '2026-11-25'), false);
  assert.equal(isScheduleDueOrOverdue('2026-11-20', 'Paid', '2026-11-25'), false);
});

test('sanitizeProjectForMcp strictly excludes all customer PII while retaining customer_code', () => {
  const raw = {
    id: 1,
    project_code: 'PRJ-101',
    customer_code: 'CU-101',
    customer_name: 'Tariq Rahman',
    customer_company: 'Bengal Craft Apparel',
    customer_email: 'tariq@bengalcraft.com',
    customer_phone: '+880 1711-240910',
    title: 'Multi-Currency Storefront',
    status: 'In Progress' as const,
    budget: 180000,
    paid_amount: 90000,
    due_amount: 90000,
    progress_percent: 50,
    payment_status: 'Partial' as const,
    start_date: '2026-10-01',
    end_date: '2026-12-15',
    description: 'Headless storefront',
    task_total: 3,
    task_completed: 1,
  };

  const sanitized = sanitizeProjectForMcp(raw) as unknown as Record<string, unknown>;
  assert.equal(sanitized.customer_code, 'CU-101');
  assert.equal(sanitized.project_code, 'PRJ-101');
  assert.equal('customer_name' in sanitized, false);
  assert.equal('customer_company' in sanitized, false);
  assert.equal('customer_email' in sanitized, false);
  assert.equal('customer_phone' in sanitized, false);
});

test('report builders and BDT formatter produce accurate monthly cashflow and status totals', () => {
  const series = buildMonthlyCashflowSeries([
    { type: 'Income', amount: 120000, transaction_date: '2026-10-05' },
    { type: 'Expense', amount: 45000, transaction_date: '2026-10-12' },
    { type: 'Income', amount: 85000, transaction_date: '2026-11-04' },
  ]);
  assert.equal(series.length, 2);
  assert.equal(series[0].month, '2026-10');
  assert.equal(series[0].net, 75000);
  assert.equal(series[1].month, '2026-11');
  assert.equal(series[1].income, 85000);

  const breakdown = buildProjectStatusBreakdown([
    { status: 'In Progress', budget: 100000 },
    { status: 'In Progress', budget: 50000 },
    { status: 'Completed', budget: 80000 },
  ]);
  assert.equal(breakdown.find((b) => b.status === 'In Progress')?.count, 2);
  assert.equal(breakdown.find((b) => b.status === 'In Progress')?.budget, 150000);
  assert.equal(breakdown.find((b) => b.status === 'Pending')?.count, 0);

  assert.equal(formatBdtPlain(10500).startsWith('৳'), true);
});

test('amount validators, token hashing, and RBAC checks enforce domain boundaries', () => {
  assert.equal(validatePositiveAmount('250.456'), 250.46);
  assert.equal(validatePositiveAmount(0), null);
  assert.equal(validateNonNegativeAmount(0), 0);
  assert.equal(validateNonNegativeAmount(-1), null);

  const hashA = hashMcpToken('gdit_mcp_test_token');
  const hashB = hashMcpToken('gdit_mcp_test_token');
  assert.equal(hashA, hashB);
  assert.equal(hashA.length, 64);

  assert.equal(canManageUsers('superadmin'), true);
  assert.equal(canManageUsers('employee'), false);
  assert.equal(canDeleteRecords('superadmin'), true);
  assert.equal(canDeleteRecords('employee'), false);
  assert.equal(canViewAllAuditLogs('superadmin'), true);
  assert.equal(canViewAllAuditLogs('employee'), false);
});

test('default Superadmin seeder creates hashed account once and never duplicates or overwrites', () => {
  const mockStore = {
    users: [],
    seq: { users: 1 },
  } as unknown as MemoryStore;

  seedMemoryDefaultSuperadmin(mockStore);
  assert.equal(mockStore.users.length, 1);
  assert.equal(mockStore.users[0].name, 'Emon Hosen');
  assert.equal(mockStore.users[0].email, 'growdeshit@gmail.com');
  assert.equal(mockStore.users[0].phone, '+8801806476652');
  assert.equal(mockStore.users[0].role, 'superadmin');
  assert.notEqual(mockStore.users[0].password_hash, 'Password#Password');
  assert.equal(bcrypt.compareSync('Password#Password', DEFAULT_SUPERADMIN.passwordHash), true);
  assert.equal(bcrypt.compareSync('wrong-password', DEFAULT_SUPERADMIN.passwordHash), false);

  // Subsequent runs must never duplicate or overwrite existing user data
  mockStore.users[0].name = 'Emon Hosen (Updated)';
  seedMemoryDefaultSuperadmin(mockStore);
  assert.equal(mockStore.users.length, 1);
  assert.equal(mockStore.users[0].name, 'Emon Hosen (Updated)');
});

test('OAuth 2.1 PKCE S256, redirect URI validation, secret hashing, and HTML escaping behave securely', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk_valid_verifier_12345';
  const challenge = computePkceS256Challenge(verifier);
  assert.equal(verifyPkceS256(verifier, challenge), true);
  assert.equal(verifyPkceS256(verifier + 'x', challenge), false);
  assert.equal(verifyPkceS256('too_short', challenge), false);

  const secret = 'gdit_cs_super_secret_value_1234567890';
  const secretHash = hashMcpToken(secret);
  assert.equal(timingSafeHashMatch(secret, secretHash), true);
  assert.equal(timingSafeHashMatch('wrong_secret', secretHash), false);

  assert.equal(
    validateOAuthRedirectUri('https://gemini.google.com/oauth/callback'),
    'https://gemini.google.com/oauth/callback'
  );
  assert.equal(
    validateOAuthRedirectUri('http://localhost:8080/callback'),
    'http://localhost:8080/callback'
  );
  assert.equal(validateOAuthRedirectUri('http://example.com/callback'), null);
  assert.equal(validateOAuthRedirectUri('javascript:alert(1)'), null);
  assert.equal(validateOAuthRedirectUri('https://gemini.google.com/cb#frag'), null);

  assert.equal(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
  );
});
