import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Receipt,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { ActivityLogsView } from './components/ActivityLogsView';
import { AuthView } from './components/AuthView';
import { CustomersView } from './components/CustomersView';
import { DashboardView } from './components/DashboardView';
import { FinanceView } from './components/FinanceView';
import { InvoiceModal } from './components/InvoiceModal';
import { NotificationBell } from './components/NotificationBell';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { ProjectsView } from './components/ProjectsView';
import { ReportsView } from './components/ReportsView';
import { TeamView } from './components/TeamView';
import { useAuth } from './context/AuthContext';
import { api, ApiError } from './services/api';
import type { AppNotification, DashboardOverview } from './types/models';

type NavTab =
  | 'overview'
  | 'customers'
  | 'projects'
  | 'finance'
  | 'reports'
  | 'activity'
  | 'team';

export default function App() {
  const { user, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [invoicePaymentId, setInvoicePaymentId] = useState<number | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Modal triggers controlled by top contextual CTA
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [prefillCustomerId, setPrefillCustomerId] = useState<number | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);

  // Dashboard & Notifications state
  const [dashboardData, setDashboardData] = useState<DashboardOverview | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.listNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Non-blocking header poll
    }
  }, [user]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const data = await api.getDashboard();
      setDashboardData(data);
    } catch (err) {
      setDashboardError(err instanceof ApiError ? err.message : 'Unable to load dashboard.');
    } finally {
      setDashboardLoading(false);
    }
  }, [user]);

  const refreshGlobalData = useCallback(() => {
    void loadDashboard();
    void loadNotifications();
  }, [loadDashboard, loadNotifications]);

  useEffect(() => {
    if (user) {
      void loadDashboard();
      void loadNotifications();
    } else {
      setDashboardData(null);
      setNotifications([]);
      setUnreadCount(0);
      setActiveTab('overview');
      setSelectedProjectId(null);
      setInvoicePaymentId(null);
      setMobileMoreOpen(false);
    }
  }, [user, loadDashboard, loadNotifications]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-600">Loading GrowDeshIT OS...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthView />
        <OfflineIndicator />
      </>
    );
  }

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'projects', label: 'Projects', icon: Briefcase },
    { id: 'finance', label: 'Finance', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'team', label: 'Team & MCP', icon: Shield },
  ];

  const primaryMobileTabs: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'customers', label: 'Clients', icon: Users },
    { id: 'projects', label: 'Projects', icon: Briefcase },
    { id: 'finance', label: 'Finance', icon: Receipt },
  ];

  const secondaryMobileTabs: Array<{
    id: NavTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'reports',
      label: 'Reports & Analytics',
      description: 'BDT cashflow charts, net profit, and printable reports',
      icon: BarChart3,
    },
    {
      id: 'activity',
      label: 'Activity Logs',
      description: 'Audit trail for Web and MCP actions',
      icon: Activity,
    },
    {
      id: 'team',
      label: 'Team & MCP Access',
      description: 'Roles, team directory, and personal MCP tokens',
      icon: Shield,
    },
  ];

  const isMoreTabActive =
    activeTab === 'reports' || activeTab === 'activity' || activeTab === 'team';

  const handleNavigate = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab !== 'projects') setSelectedProjectId(null);
    setMobileMoreOpen(false);
  };

  const handleOpenProject = (projectId: number) => {
    setSelectedProjectId(projectId);
    setActiveTab('projects');
    setMobileMoreOpen(false);
  };

  const handleCreateProjectForCustomer = (customerId: number) => {
    setPrefillCustomerId(customerId);
    setSelectedProjectId(null);
    setActiveTab('projects');
    setProjectModalOpen(true);
  };

  const handleMarkNotificationRead = async (id: number) => {
    await api.markNotificationRead(id);
    await loadNotifications();
  };

  const handleMarkAllNotificationsRead = async () => {
    await api.markAllNotificationsRead();
    await loadNotifications();
  };

  const getHeaderMeta = (): {
    title: string;
    ctaLabel: string | null;
    onCta: (() => void) | null;
  } => {
    switch (activeTab) {
      case 'overview':
        return {
          title: 'Overview',
          ctaLabel: 'New Project',
          onCta: () => {
            setPrefillCustomerId(null);
            setSelectedProjectId(null);
            setActiveTab('projects');
            setProjectModalOpen(true);
          },
        };
      case 'customers':
        return {
          title: 'Customers',
          ctaLabel: 'Add Customer',
          onCta: () => setCustomerModalOpen(true),
        };
      case 'projects':
        return {
          title: selectedProjectId ? 'Project Workspace' : 'Projects',
          ctaLabel: selectedProjectId ? null : 'New Project',
          onCta: selectedProjectId
            ? null
            : () => {
                setPrefillCustomerId(null);
                setProjectModalOpen(true);
              },
        };
      case 'finance':
        return {
          title: 'Finance & Invoicing',
          ctaLabel: 'Log Transaction',
          onCta: () => setTxModalOpen(true),
        };
      case 'reports':
        return {
          title: 'Reports',
          ctaLabel: null,
          onCta: null,
        };
      case 'activity':
        return {
          title: 'Activity Logs',
          ctaLabel: null,
          onCta: null,
        };
      case 'team':
        return {
          title: 'Team & MCP',
          ctaLabel: user.role === 'superadmin' ? 'Add Member' : null,
          onCta: user.role === 'superadmin' ? () => setTeamModalOpen(true) : null,
        };
    }
  };

  const headerMeta = getHeaderMeta();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row overflow-x-clip">
      {/* Desktop Sidebar (248px) */}
      <aside className="no-print hidden md:flex md:w-[248px] md:fixed md:inset-y-0 md:left-0 bg-white border-r border-slate-200/90 flex-col justify-between z-30">
        <div>
          <div className="h-16 px-5 flex items-center gap-2.5 border-b border-slate-100">
            <img src="/icon.svg" alt="GrowDeshIT OS" className="w-7 h-7 rounded-md shrink-0" />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              GrowDeshIT OS
            </span>
          </div>

          <nav aria-label="Primary navigation" className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full min-h-[40px] px-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 text-teal-800'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-teal-700' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-100 space-y-3">
          <PWAInstallButton />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {user.role === 'superadmin' ? 'Superadmin' : 'Employee'}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 md:pl-[248px] flex flex-col min-h-screen min-w-0">
        {/* Top Bar (Compact 52px mobile, 64px desktop) */}
        <header className="no-print sticky top-0 z-20 h-[52px] md:h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200/90 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/icon.svg"
              alt="GrowDeshIT OS"
              className="w-6 h-6 rounded-md md:hidden shrink-0"
            />
            <h1 className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 truncate">
              {headerMeta.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="md:hidden">
              <PWAInstallButton compact />
            </div>

            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onOpenProject={handleOpenProject}
            />

            {headerMeta.ctaLabel && headerMeta.onCta && (
              <button
                type="button"
                onClick={headerMeta.onCta}
                className="inline-flex items-center gap-1.5 min-h-[38px] md:min-h-[40px] px-3 md:px-4 rounded-lg bg-teal-700 text-xs md:text-sm font-medium text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{headerMeta.ctaLabel}</span>
              </button>
            )}

            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="md:hidden min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Scrollable Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-10 max-w-7xl w-full mx-auto min-w-0">
          {activeTab === 'overview' && (
            <DashboardView
              data={dashboardData}
              loading={dashboardLoading}
              error={dashboardError}
              onRetry={() => void loadDashboard()}
              onOpenProject={handleOpenProject}
              onViewInvoice={(id) => setInvoicePaymentId(id)}
              onNavigateTab={(tab) => handleNavigate(tab)}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              userRole={user.role}
              createModalOpen={customerModalOpen}
              onCloseCreateModal={() => setCustomerModalOpen(false)}
              onOpenCreateModal={() => setCustomerModalOpen(true)}
              onOpenProject={handleOpenProject}
              onCreateProjectForCustomer={handleCreateProjectForCustomer}
              onDataChanged={refreshGlobalData}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsView
              userRole={user.role}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
              createModalOpen={projectModalOpen}
              prefillCustomerId={prefillCustomerId}
              onCloseCreateModal={() => {
                setProjectModalOpen(false);
                setPrefillCustomerId(null);
              }}
              onOpenCreateModal={() => setProjectModalOpen(true)}
              onViewInvoice={(id) => setInvoicePaymentId(id)}
              onDataChanged={refreshGlobalData}
            />
          )}

          {activeTab === 'finance' && (
            <FinanceView
              userRole={user.role}
              txModalOpen={txModalOpen}
              onCloseTxModal={() => setTxModalOpen(false)}
              onOpenTxModal={() => setTxModalOpen(true)}
              onViewInvoice={(id) => setInvoicePaymentId(id)}
              onDataChanged={refreshGlobalData}
            />
          )}

          {activeTab === 'reports' && <ReportsView onOpenProject={handleOpenProject} />}

          {activeTab === 'activity' && <ActivityLogsView />}

          {activeTab === 'team' && (
            <TeamView
              currentUser={user}
              addModalOpen={teamModalOpen}
              onCloseAddModal={() => setTeamModalOpen(false)}
            />
          )}
        </main>
      </div>

      {/* Mobile More Drawer (Reports, Activity Logs, Team & MCP) */}
      {mobileMoreOpen && (
        <div
          className="no-print md:hidden fixed inset-0 z-40 bg-slate-900/40 flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="More workspace modules"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl border-t border-slate-200 p-4 pb-20 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100">
              <span className="font-display text-sm font-semibold text-slate-900">
                More Modules
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close more menu"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {secondaryMobileTabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full p-3 rounded-xl flex items-center gap-3 text-left transition-colors cursor-pointer ${
                    active ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-xs text-slate-500 truncate">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (64px, 5 clean thumb tabs) */}
      <nav
        aria-label="Mobile navigation"
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {primaryMobileTabs.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors cursor-pointer ${
                  isActive ? 'text-teal-700' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-medium tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMoreOpen((prev) => !prev)}
            aria-expanded={mobileMoreOpen}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors cursor-pointer ${
              isMoreTabActive || mobileMoreOpen ? 'text-teal-700' : 'text-slate-500'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            <span className="text-[10px] font-medium tracking-tight leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* Printable Invoice Modal */}
      {invoicePaymentId !== null && (
        <InvoiceModal paymentId={invoicePaymentId} onClose={() => setInvoicePaymentId(null)} />
      )}

      <OfflineIndicator />
    </div>
  );
}
