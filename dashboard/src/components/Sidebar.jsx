import React, { useEffect } from 'react';
import { LifeBuoy, LogOut, X } from 'lucide-react';
import { cx, IconButton } from './ui';

/*
 * Sidebar generik untuk portal karyawan & HR.
 * Desktop (lg+): menempel di kiri. Mobile: drawer yang dibuka dari header.
 */
export default function Sidebar({ items, active, onSelect, subtitle, onLogout, open, onClose, extra, onHelp, helpActive = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const select = (id) => {
    onSelect(id);
    onClose?.();
  };

  const openHelp = () => {
    onHelp?.();
    onClose?.();
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 animate-fade-in bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200',
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Navigasi utama"
      >
        <div className="flex h-16 items-center gap-3 px-5">
          <img src="/assets/logo.jpg" alt="" className="h-8 w-8 rounded-lg object-cover" />
          <div className="min-w-0 leading-tight">
            <p className="font-display text-[15px] font-semibold">Blue Rose Tech</p>
            <p className="truncate text-xs text-faint">{subtitle}</p>
          </div>
          <IconButton label="Tutup menu" onClick={onClose} className="ml-auto lg:hidden">
            <X size={18} />
          </IconButton>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => select(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-accent-soft font-medium text-accent-text'
                    : 'text-muted hover:bg-subtle hover:text-fg',
                )}
              >
                <Icon size={18} strokeWidth={isActive ? 2.1 : 1.8} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {item.count != null && (
                  <span className="num ml-auto rounded-md bg-subtle px-1.5 text-xs font-medium text-muted">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-0.5 border-t border-line p-3">
          {extra}
          <button
            type="button"
            onClick={openHelp}
            aria-current={helpActive ? 'page' : undefined}
            className={cx(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
              helpActive ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-subtle hover:text-fg',
            )}
          >
            <LifeBuoy size={18} strokeWidth={helpActive ? 2.1 : 1.8} aria-hidden="true" />
            Bantuan
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            Keluar
          </button>
        </div>
      </aside>
    </>
  );
}
