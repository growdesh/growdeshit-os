import type { CustomerStatus, ProjectStatus } from '../types/models';

const bdtNumberFormatter = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const formatted = bdtNumberFormatter.format(Math.abs(safe));
  return `${negative ? '-' : ''}৳ ${formatted}`;
}

export function formatCompactBdt(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? '-' : '';
  if (abs >= 100000) {
    return `${sign}৳ ${(abs / 100000).toFixed(1)}L`;
  }
  if (abs >= 1000) {
    return `${sign}৳ ${(abs / 1000).toFixed(0)}k`;
  }
  return `${sign}৳ ${Math.round(abs)}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getProjectStatusTone(status: ProjectStatus): string {
  switch (status) {
    case 'Completed':
      return 'text-emerald-700';
    case 'In Progress':
      return 'text-teal-700';
    case 'Review':
      return 'text-amber-700';
    case 'Pending':
    default:
      return 'text-slate-600';
  }
}

export function getCustomerStatusTone(status: CustomerStatus): string {
  switch (status) {
    case 'Active':
      return 'text-emerald-700';
    case 'Lead':
      return 'text-amber-700';
    case 'Inactive':
    default:
      return 'text-slate-500';
  }
}

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}
