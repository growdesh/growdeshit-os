import React, { useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, Check, CheckCheck, ExternalLink } from 'lucide-react';
import type { AppNotification } from '../types/models';
import { formatCurrency, formatDate } from '../utils/formatters';

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkRead: (id: number) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenProject: (projectId: number) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onOpenProject,
}) => {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | 'all' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleRead = async (id: number) => {
    setBusyId(id);
    try {
      await onMarkRead(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleReadAll = async () => {
    setBusyId('all');
    try {
      await onMarkAllRead();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        className="relative min-h-[38px] min-w-[38px] md:min-h-[40px] md:min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono-tabular inline-flex items-center justify-center leading-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Payment reminders and notifications"
          className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[60px] sm:top-full sm:mt-2 sm:w-[380px] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Payment Reminders
              </h2>
              <p className="text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={busyId === 'all'}
                onClick={() => void handleReadAll()}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-[65vh] sm:max-h-[400px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CalendarClock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">No payment reminders due</p>
                <p className="text-xs text-slate-500 mt-1">
                  Scheduled project payments appear here automatically when their due date arrives.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`px-4 py-3 transition-colors ${
                    notif.is_read ? 'bg-white' : 'bg-teal-50/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!notif.is_read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                        )}
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {notif.title}
                        </p>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
                        {notif.amount !== null && (
                          <span className="font-mono-tabular font-semibold text-slate-800">
                            {formatCurrency(notif.amount)}
                          </span>
                        )}
                        {notif.due_date && (
                          <span>Due {formatDate(notif.due_date)}</span>
                        )}
                      </div>
                    </div>

                    {!notif.is_read && (
                      <button
                        type="button"
                        disabled={busyId === notif.id}
                        onClick={() => void handleRead(notif.id)}
                        aria-label="Mark notification read"
                        title="Mark read"
                        className="p-1.5 rounded-md text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {notif.project_id && (
                    <div className="mt-2 pt-2 border-t border-slate-100/80 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!notif.is_read) void handleRead(notif.id);
                          setOpen(false);
                          onOpenProject(notif.project_id!);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 cursor-pointer"
                      >
                        <span>Open {notif.project_code || 'Project'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
