import {
  buildMonthlyCashflowSeries,
  buildProjectStatusBreakdown,
  classifyScheduleDueState,
  computeCollectionRatePercent,
  computeProfitMarginPercent,
  isValidIsoDate,
  isValidYearMonth,
  roundMoney,
  type MonthlyCashflowPoint,
  type ProjectStatus,
  type ProjectStatusBreakdownPoint,
  type ScheduleDueState,
} from '../utils/businessLogic';
import { listTransactions } from './financeService';
import { listPaymentSchedules } from './notificationService';
import { listProjects } from './projectService';

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

export interface McpPendingBalanceRow {
  id: number;
  project_code: string;
  title: string;
  customer_code: string;
  status: ProjectStatus;
  budget: number;
  paid_amount: number;
  due_amount: number;
  progress_percent: number;
  payment_status: 'Unpaid' | 'Partial' | 'Paid';
}

export interface McpScheduleAlertRow {
  id: number;
  project_code: string;
  customer_code: string;
  project_title: string;
  milestone_title: string;
  amount: number;
  due_date: string;
  status: 'Pending' | 'Paid';
  due_state: ScheduleDueState;
}

export interface FinancialReportData {
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
    profitMarginPercent: number;
    pendingDues: number;
    totalBudget: number;
    totalCollected: number;
    collectionRatePercent: number;
    activeProjects: number;
    completedProjects: number;
    totalProjects: number;
  };
  monthlyCashflow: MonthlyCashflowPoint[];
  monthlyCashflowLast6Months: MonthlyCashflowPoint[];
  projectStatusBreakdown: ProjectStatusBreakdownPoint[];
  incomeByCategory: Array<{ category: string; amount: number }>;
  expenseByCategory: Array<{ category: string; amount: number }>;
  pendingBalances: PendingBalanceRow[];
}

export interface McpBusinessAnalyticsData {
  filters: {
    month: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  currency: 'BDT';
  as_of_date: string;
  summary: FinancialReportData['summary'];
  incomeByCategory: Array<{ category: string; amount: number }>;
  expenseByCategory: Array<{ category: string; amount: number }>;
  monthlyCashflow: MonthlyCashflowPoint[];
  monthlyCashflowLast6Months: MonthlyCashflowPoint[];
  projectStatusBreakdown: ProjectStatusBreakdownPoint[];
  overdueSchedules: McpScheduleAlertRow[];
  upcomingSchedules: McpScheduleAlertRow[];
  topPendingDueProjects: McpPendingBalanceRow[];
  pendingBalances: McpPendingBalanceRow[];
}

export async function getFinancialReport(filters?: {
  month?: string;
  startDate?: string;
  endDate?: string;
}): Promise<FinancialReportData> {
  const month =
    filters?.month && isValidYearMonth(filters.month.trim()) ? filters.month.trim() : null;
  const startDate =
    filters?.startDate && isValidIsoDate(filters.startDate.trim())
      ? filters.startDate.trim()
      : null;
  const endDate =
    filters?.endDate && isValidIsoDate(filters.endDate.trim()) ? filters.endDate.trim() : null;

  const [allTransactions, allProjects] = await Promise.all([listTransactions(), listProjects()]);

  const filteredTransactions = allTransactions.filter((tx) => {
    const d = (tx.transaction_date || '').slice(0, 10);
    if (month) {
      return d.startsWith(month);
    }
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  const incomeMap = new Map<string, number>();
  const expenseMap = new Map<string, number>();

  for (const tx of filteredTransactions) {
    const amt = Math.max(0, Number(tx.amount) || 0);
    if (tx.type === 'Income') {
      totalIncome += amt;
      incomeMap.set(tx.category, (incomeMap.get(tx.category) ?? 0) + amt);
    } else if (tx.type === 'Expense') {
      totalExpenses += amt;
      expenseMap.set(tx.category, (expenseMap.get(tx.category) ?? 0) + amt);
    }
  }

  const totalBudget = roundMoney(allProjects.reduce((s, p) => s + p.budget, 0));
  const totalCollected = roundMoney(allProjects.reduce((s, p) => s + p.paid_amount, 0));
  const pendingDues = roundMoney(allProjects.reduce((s, p) => s + p.due_amount, 0));
  const activeProjects = allProjects.filter((p) => p.status !== 'Completed').length;
  const completedProjects = allProjects.filter((p) => p.status === 'Completed').length;

  const roundedIncome = roundMoney(totalIncome);
  const roundedExpenses = roundMoney(totalExpenses);
  const netProfit = roundMoney(roundedIncome - roundedExpenses);

  const pendingBalances: PendingBalanceRow[] = allProjects
    .map((p) => ({
      id: p.id,
      project_code: p.project_code,
      title: p.title,
      customer_code: p.customer_code,
      customer_name: p.customer_name,
      customer_company: p.customer_company,
      status: p.status,
      budget: p.budget,
      paid_amount: p.paid_amount,
      due_amount: p.due_amount,
      progress_percent: p.progress_percent,
    }))
    .sort((a, b) => b.due_amount - a.due_amount || b.budget - a.budget);

  const incomeByCategory = Array.from(incomeMap.entries())
    .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const expenseByCategory = Array.from(expenseMap.entries())
    .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount);

  const allMonthlyCashflow = buildMonthlyCashflowSeries(allTransactions);
  const monthlyCashflowLast6Months = allMonthlyCashflow.slice(-6);

  return {
    filters: { month, startDate, endDate },
    currency: 'BDT',
    summary: {
      totalIncome: roundedIncome,
      totalExpenses: roundedExpenses,
      netProfit,
      profitMarginPercent: computeProfitMarginPercent(roundedIncome, netProfit),
      pendingDues,
      totalBudget,
      totalCollected,
      collectionRatePercent: computeCollectionRatePercent(totalBudget, totalCollected),
      activeProjects,
      completedProjects,
      totalProjects: allProjects.length,
    },
    monthlyCashflow: buildMonthlyCashflowSeries(filteredTransactions),
    monthlyCashflowLast6Months,
    projectStatusBreakdown: buildProjectStatusBreakdown(allProjects),
    incomeByCategory,
    expenseByCategory,
    pendingBalances,
  };
}

export async function getMcpBusinessAnalytics(filters?: {
  month?: string;
  startDate?: string;
  endDate?: string;
}): Promise<McpBusinessAnalyticsData> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [report, allProjects, allSchedules] = await Promise.all([
    getFinancialReport(filters),
    listProjects(),
    listPaymentSchedules(),
  ]);

  const paymentStatusByProjectId = new Map(allProjects.map((p) => [p.id, p.payment_status]));

  // Strictly strip customer personal names and company names for MCP privacy compliance
  const sanitizedPendingBalances: McpPendingBalanceRow[] = report.pendingBalances.map((row) => ({
    id: row.id,
    project_code: row.project_code,
    title: row.title,
    customer_code: row.customer_code,
    status: row.status,
    budget: row.budget,
    paid_amount: row.paid_amount,
    due_amount: row.due_amount,
    progress_percent: row.progress_percent,
    payment_status:
      paymentStatusByProjectId.get(row.id) ??
      (row.due_amount === 0 && row.budget > 0 ? 'Paid' : row.paid_amount > 0 ? 'Partial' : 'Unpaid'),
  }));

  const topPendingDueProjects = sanitizedPendingBalances
    .filter((row) => row.due_amount > 0)
    .sort((a, b) => b.due_amount - a.due_amount || b.budget - a.budget);

  const overdueSchedules: McpScheduleAlertRow[] = [];
  const upcomingSchedules: McpScheduleAlertRow[] = [];

  for (const schedule of allSchedules) {
    if (schedule.status !== 'Pending') continue;
    const dueDate = String(schedule.due_date).slice(0, 10);
    const dueState = classifyScheduleDueState(dueDate, schedule.status, todayIso);
    const sanitized: McpScheduleAlertRow = {
      id: schedule.id,
      project_code: schedule.project_code,
      customer_code: schedule.customer_code,
      project_title: schedule.project_title,
      milestone_title: schedule.milestone_title,
      amount: roundMoney(schedule.amount),
      due_date: dueDate,
      status: schedule.status,
      due_state: dueState,
    };

    if (dueState === 'Overdue') {
      overdueSchedules.push(sanitized);
    } else {
      upcomingSchedules.push(sanitized);
    }
  }

  return {
    filters: report.filters,
    currency: report.currency,
    as_of_date: todayIso,
    summary: report.summary,
    incomeByCategory: report.incomeByCategory,
    expenseByCategory: report.expenseByCategory,
    monthlyCashflow: report.monthlyCashflow,
    monthlyCashflowLast6Months: report.monthlyCashflowLast6Months,
    projectStatusBreakdown: report.projectStatusBreakdown,
    overdueSchedules,
    upcomingSchedules,
    topPendingDueProjects,
    pendingBalances: sanitizedPendingBalances,
  };
}

export async function getMcpFinancialReport(filters?: {
  month?: string;
  startDate?: string;
  endDate?: string;
}): Promise<McpBusinessAnalyticsData> {
  return getMcpBusinessAnalytics(filters);
}
