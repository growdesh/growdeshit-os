import { computeDashboardKPIs, type DashboardKPIs } from '../utils/businessLogic';
import { listCustomers } from './customerService';
import { listPayments, listTransactions, type PaymentWithMeta } from './financeService';
import { listProjects, type ProjectSummary } from './projectService';

export interface DashboardOverview {
  kpis: DashboardKPIs;
  recentProjects: ProjectSummary[];
  recentPayments: PaymentWithMeta[];
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const [customers, projects, transactions, payments] = await Promise.all([
    listCustomers(),
    listProjects(),
    listTransactions(),
    listPayments(),
  ]);

  const kpis = computeDashboardKPIs(customers, projects, transactions, payments);

  return {
    kpis,
    recentProjects: projects.slice(0, 6),
    recentPayments: payments.slice(0, 6),
  };
}
