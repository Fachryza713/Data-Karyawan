import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

/* Gabung className tanpa dependensi tambahan */
export const cx = (...c) => c.filter(Boolean).join(' ');

/* ── Layout ── */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, as: Tag = 'section', ...rest }) {
  return (
    <Tag className={cx('rounded-card border border-line bg-surface', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-6">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/* Label kecil di atas angka/nilai */
export function Eyebrow({ children, className }) {
  return <p className={cx('text-xs font-medium text-faint', className)}>{children}</p>;
}

/* ── Button ── */
const BTN_VARIANT = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-subtle',
  ghost: 'text-muted hover:bg-subtle hover:text-fg',
  danger: 'border border-line-strong bg-surface text-danger hover:bg-danger-soft',
  success: 'bg-success text-white hover:opacity-90 dark:text-canvas',
};
const BTN_SIZE = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({ variant = 'primary', size = 'md', className, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── Badge ── */
const TONE = {
  neutral: 'bg-subtle text-muted',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ── Skeleton: blok abu-abu selagi data dimuat (berkedip hanya bila gerak diizinkan) ── */
export function Skeleton({ className }) {
  return <span className={cx('block rounded-md bg-subtle motion-safe:animate-pulse', className)} aria-hidden="true" />;
}

/* ── Avatar inisial (warna netral, bukan pelangi acak) ── */
export function Avatar({ name = '', src, size = 36, className }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent-text',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden={src ? undefined : 'true'}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

/* ── Form ── */
export const inputCls =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-faint ' +
  'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring ' +
  '[&[readonly]]:bg-subtle [&[readonly]]:text-muted [&[readonly]]:focus:ring-0 [&[readonly]]:focus:border-line-strong';

export function Field({ label, hint, required, htmlFor, aside, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-fg">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        {aside && <span className="text-xs text-faint">{aside}</span>}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

/* Pilihan tunggal bergaya segmen — dipakai menggantikan tombol-tombol radio */
export function Segmented({ options, value, onChange, name, className }) {
  return (
    <div role="radiogroup" aria-label={name} className={cx('flex rounded-lg border border-line-strong bg-subtle p-0.5', className)}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-9 flex-1 rounded-md px-3 text-[13px] font-medium transition-colors',
              selected ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Modal: Esc, klik backdrop, kunci scroll, fokus awal & kembali ── */
export function Modal({ title, description, onClose, children, footer, size = 'md' }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Sekali saat mount: handler memakai ref agar fokus tidak di-reset tiap render
  useEffect(() => {
    const prevFocus = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative flex max-h-[92vh] w-full animate-modal-in flex-col rounded-t-2xl border border-line bg-surface shadow-xl outline-none sm:rounded-2xl',
          size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <IconButton label="Tutup" onClick={onClose} className="-mr-1.5 -mt-1">
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Toast ── */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, type = 'success') => {
    clearTimeout(timer.current);
    setToast({ msg, type });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const node = (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] sm:bottom-6 sm:right-6">
      {toast && (
        <div className="pointer-events-auto flex animate-modal-in items-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-3 text-sm shadow-lg">
          {toast.type === 'error'
            ? <AlertCircle size={18} className="text-danger" />
            : <CheckCircle2 size={18} className="text-success" />}
          <span className="text-fg">{toast.msg}</span>
        </div>
      )}
    </div>
  );
  return [show, node];
}

/* ── Pagination sederhana ── */
export function Pagination({ page, totalPages, onChange, summary }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[13px] text-muted">{summary}</span>
      <nav className="flex items-center gap-1" aria-label="Halaman">
        <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>
          Sebelumnya
        </Button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-current={page === n ? 'page' : undefined}
            className={cx(
              'num h-8 min-w-8 rounded-md px-2 text-[13px] font-medium transition-colors',
              page === n ? 'bg-subtle text-fg ring-1 ring-line-strong' : 'text-muted hover:bg-subtle',
            )}
          >
            {n}
          </button>
        ))}
        <Button variant="ghost" size="sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
          Berikutnya
        </Button>
      </nav>
    </div>
  );
}

/* ── Hook tema: class `dark` di <html>, diingat per perangkat ── */
export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('brt-theme');
      if (saved) return saved === 'dark';
    } catch { /* storage tidak tersedia */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try { localStorage.setItem('brt-theme', isDark ? 'dark' : 'light'); } catch { /* abaikan */ }
  }, [isDark]);

  const toggle = useCallback(() => setIsDark((d) => !d), []);
  return { isDark, setIsDark, toggle };
}
