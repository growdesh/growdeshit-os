import {
  buildMonthlyCashflowSeries,
  buildProjectStatusBreakdown,
  roundMoney,
  type MonthlyCashflowPoint,
  type ProjectStatus,
  type ProjectStatusBreakdownPoint,
} from '../utils/businessLogic';
import { listTransactions } from './financeService';
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

export async function getFinancialReport(filters?: {
  month?: string;
  startDate?: string;
  endDate?: string;
}): Promise<FinancialReportData> {
  const month = filters?.month && /^\d{4}-\d{2}$/.test(filters.month.trim())
    ? filters.month.trim()
    : null;
  const startDate =
    filters?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.startDate.trim())
      ? filters.startDate.trim()
      : null;
  const endDate =
    filters?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate.trim())
      ? filters.endDate.trim()
      : null;

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
  const expenseMap = new Map<string, number>();

  for (const tx of filteredTransactions) {
    const amt = Math.max(0, Number(tx.amount) || 0);
    if (tx.type === 'Income') {
      totalIncome += amt;
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

  const expenseByCategory = Array.from(expenseMap.entries())
    .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    filters: { month, startDate, endDate },
    currency: 'BDT',
    summary: {
      totalIncome: roundedIncome,
      totalExpenses: roundedExpenses,
      netProfit: roundMoney(roundedIncome - roundedExpenses),
      pendingDues,
      totalBudget,
      totalCollected,
      activeProjects,
      completedProjects,
      totalProjects: allProjects.length,
    },
    monthlyCashflow: buildMonthlyCashflowSeries(filteredTransactions),
    projectStatusBreakdown: buildProjectStatusBreakdown(allProjects),
    expenseByCategory,
    pendingBalances,
  };
}

export async function getMcpFinancialReport(filters?: {
  month?: string;
  startDate?: string;
  endDate?: string;
}) {
  const report = await getFinancialReport(filters);
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
  }));

  return {
    filters: report.filters,
    currency: report.currency,
    summary: report.summary,
    monthlyCashflow: report.monthlyCashflow,
    projectStatusBreakdown: report.projectStatusBreakdown,
    expenseByCategory: report.expenseByCategory,
    pendingBalances: sanitizedPendingBalances,
  };
}
