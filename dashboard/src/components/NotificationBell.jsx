import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Inbox, AlertCircle, ClipboardList, Wallet, TrendingUp, BadgeCheck } from 'lucide-react';
import { IconButton, cx } from './ui';
import { useAuth } from '../context/AuthContext';
import { useNotifications, timeAgo } from '../lib/notifications';

const TYPE_ICON = {
  request_new: ClipboardList,
  request_reviewed: BadgeCheck,
  payslip_published: Wallet,
  kpi_final: TrendingUp,
};

/**
 * Lonceng notifikasi: badge jumlah belum dibaca + panel 20 notifikasi terbaru.
 * Klik item = tandai dibaca lalu buka link-nya. Data diperbarui lewat Supabase Realtime.
 */
export default function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const notif = useNotifications(profile?.id);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const panelId = useId();
  const { rows, unread, loading, error } = notif;

  // Tutup dengan Esc atau klik di luar panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const openItem = (n) => {
    if (!n.read_at) notif.markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div ref={wrapRef} className="relative">
      <IconButton
        label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="num absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface"
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifikasi"
          className={cx(
            'fixed inset-x-2 top-[4.25rem] z-50 flex max-h-[min(32rem,calc(100vh-5rem))] animate-modal-in flex-col overflow-hidden',
            'rounded-card border border-line bg-surface shadow-xl',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96',
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Notifikasi</h2>
              <p className="text-xs text-faint">{unread ? `${unread} belum dibaca` : 'Semua sudah dibaca'}</p>
            </div>
            <button
              type="button"
              onClick={() => notif.markAllRead()}
              disabled={!unread}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent-text transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
            >
              <CheckCheck size={15} aria-hidden="true" /> Tandai semua dibaca
            </button>
          </div>

          <div className="overflow-y-auto">
            {loading && rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">Memuat…</p>
            ) : error && rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-danger">
                <AlertCircle size={16} className="mr-1.5 inline" aria-hidden="true" />
                Notifikasi gagal dimuat.{' '}
                <button type="button" onClick={notif.reload} className="font-medium underline underline-offset-2">Coba lagi</button>
              </p>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <Inbox size={24} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
                <p className="mt-2 text-sm text-muted">Belum ada notifikasi.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  const unreadItem = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle"
                      >
                        <span className={cx(
                          'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                          unreadItem ? 'bg-accent-soft text-accent-text' : 'bg-subtle text-faint',
                        )}
                        >
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cx('block text-sm', unreadItem ? 'font-semibold text-fg' : 'text-muted')}>{n.title}</span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted">{n.body}</span>}
                          <span className="mt-1 block text-xs text-faint">{timeAgo(n.created_at)}</span>
                        </span>
                        {unreadItem && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Belum dibaca" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
