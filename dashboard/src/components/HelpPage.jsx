import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, X, ChevronDown, ArrowRight, Mail, MessageCircle, Clock, SearchX, CircleHelp,
  MapPin, CalendarDays, Wallet, UserCog, Users, ClipboardCheck, TrendingUp, Settings, Download,
} from 'lucide-react';
import { PageHeader, Card, CardHeader, Button, Skeleton, inputCls, cx } from './ui';
import { useAuth } from '../context/AuthContext';
import { HELP_CONTENT, answerText } from '../lib/helpContent';
import {
  CONTACT_KEYS, useCompanySetting, isContactComplete, mailtoHref, whatsappHref, formatWhatsapp,
} from '../lib/companySettings';

const CATEGORY_ICON = {
  presensi: MapPin,
  cuti: CalendarDays,
  gaji: Wallet,
  akun: UserCog,
  karyawan: Users,
  pengajuan: ClipboardCheck,
  payroll: Wallet,
  kpi: TrendingUp,
  pengaturan: Settings,
  ekspor: Download,
};

/* Huruf kecil tanpa diakritik, agar "radius" cocok dengan "Radius". */
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Indeks pencarian: pertanyaan + jawaban + judul kategori. */
function buildIndex(categories) {
  return categories.map((c) => ({
    ...c,
    items: c.items.map((it) => ({ ...it, haystack: norm(`${it.q} ${answerText(it.a)} ${c.title}`) })),
  }));
}

/** Semua kata kunci harus muncul (AND). Kategori tanpa hasil disembunyikan. */
function filterCategories(index, query) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return index;
  return index
    .map((c) => ({ ...c, items: c.items.filter((it) => words.every((w) => it.haystack.includes(w))) }))
    .filter((c) => c.items.length > 0);
}

/* ── Isi jawaban ── */
function Answer({ blocks }) {
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        if (typeof b === 'string') return <p key={i}>{b}</p>;
        if (b.steps) {
          return (
            <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:text-faint">
              {b.steps.map((s) => <li key={s} className="pl-1">{s}</li>)}
            </ol>
          );
        }
        return (
          <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-faint">
            {b.list.map((s) => <li key={s} className="pl-1">{s}</li>)}
          </ul>
        );
      })}
    </div>
  );
}

/* ── Satu pertanyaan accordion: tombol asli (Enter/Spasi) + aria-expanded ── */
function FaqItem({ item, idPrefix, open, onToggle }) {
  const btnId = `${idPrefix}-q`;
  const panelId = `${idPrefix}-a`;
  return (
    <li>
      <h3>
        <button
          type="button"
          id={btnId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cx(
            'flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left text-sm transition-colors hover:bg-subtle',
            open ? 'font-semibold text-fg' : 'font-medium text-fg',
          )}
        >
          <span>{item.q}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cx('mt-0.5 shrink-0 text-faint transition-transform duration-150', open && 'rotate-180')}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        hidden={!open}
        className="px-5 pb-4 text-sm leading-6 text-muted"
      >
        <Answer blocks={item.a} />
        {item.links?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {item.links.map((l) => (
              <Link
                key={l.to + l.label}
                to={l.to}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
              >
                {l.label} <ArrowRight size={13} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/* ── Kartu kontak: "Hubungi HR" (karyawan) atau "Kontak admin sistem" (HR) ── */
const anchorBtn = 'inline-flex h-9 flex-1 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors duration-150';

function ContactCard({ variant }) {
  const { profile } = useAuth();
  const isAdmin = variant === 'admin';
  const { loading, error, value, reload } = useCompanySetting(isAdmin ? CONTACT_KEYS.admin : CONTACT_KEYS.hr);
  const ready = isContactComplete(value);

  return (
    <Card>
      <CardHeader
        title={isAdmin ? 'Kontak admin sistem' : 'Hubungi HR'}
        description={isAdmin
          ? 'Untuk kendala teknis: akses login, error aplikasi, atau data yang tidak bisa diubah dari menu.'
          : 'Pertanyaan belum terjawab? Tim HR siap membantu.'}
      />
      <div className="p-5">
        {loading && !value ? (
          <div className="space-y-3" aria-label="Memuat kontak">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : error ? (
          <div>
            <p className="text-sm text-danger" role="alert">Kontak gagal dimuat.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>Coba lagi</Button>
          </div>
        ) : !ready ? (
          <p className="text-sm text-muted">
            {isAdmin ? 'Kontak admin sistem belum diatur.' : 'Kontak HR belum diatur. Tanyakan langsung ke tim HR di kantor.'}
          </p>
        ) : (
          <>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2.5">
                <dt><Clock size={16} className="mt-0.5 text-faint" aria-hidden="true" /><span className="sr-only">Jam layanan</span></dt>
                <dd>{value.hours}</dd>
              </div>
              <div className="flex items-start gap-2.5">
                <dt><Mail size={16} className="mt-0.5 text-faint" aria-hidden="true" /><span className="sr-only">Email</span></dt>
                <dd className="min-w-0 break-all">{value.email}</dd>
              </div>
              <div className="flex items-start gap-2.5">
                <dt><MessageCircle size={16} className="mt-0.5 text-faint" aria-hidden="true" /><span className="sr-only">WhatsApp</span></dt>
                <dd className="num">{formatWhatsapp(value.whatsapp)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <a
                href={mailtoHref(value.email, profile?.full_name)}
                className={cx(anchorBtn, 'border border-line-strong bg-surface text-fg hover:bg-subtle')}
              >
                <Mail size={16} aria-hidden="true" /> Email
              </a>
              <a
                href={whatsappHref(value.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={cx(anchorBtn, 'bg-accent text-white hover:bg-accent-hover')}
              >
                <MessageCircle size={16} aria-hidden="true" /> WhatsApp
                <span className="sr-only">(membuka tab baru)</span>
              </a>
            </div>
            <p className="mt-3 text-xs text-faint">Pesan di luar jam layanan dibalas pada jam layanan berikutnya.</p>
          </>
        )}
      </div>
    </Card>
  );
}

/* ── Halaman Bantuan: /app/bantuan (role employee) dan /hr/bantuan (role hr) ── */
export default function HelpPage({ role }) {
  const isHr = role === 'hr';
  const baseId = useId();
  const index = useMemo(() => buildIndex(HELP_CONTENT[isHr ? 'hr' : 'employee']), [isHr]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(() => new Set());

  const shown = useMemo(() => filterCategories(index, query), [index, query]);
  const total = index.reduce((n, c) => n + c.items.length, 0);
  const found = shown.reduce((n, c) => n + c.items.length, 0);
  const searching = query.trim() !== '';

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <>
      <PageHeader
        title="Bantuan"
        description={isHr
          ? 'Panduan alur kerja portal HR: karyawan, pengajuan, payroll, KPI, pengaturan, dan ekspor.'
          : 'Jawaban untuk pertanyaan seputar presensi, cuti, gaji, dan akun.'}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <div role="search" className="relative">
            <label htmlFor={`${baseId}-search`} className="sr-only">Cari bantuan</label>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
            <input
              id={`${baseId}-search`}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery(''); } }}
              placeholder={isHr ? 'Cari panduan, misal: payroll, radius, CSV' : 'Cari pertanyaan, misal: radius, slip, kuota'}
              className={cx(inputCls, 'pl-9 pr-10')}
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Hapus pencarian"
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-2 text-[13px] text-muted" aria-live="polite">
            {searching
              ? <><span className="num">{found}</span> hasil untuk “{query.trim()}”</>
              : <><span className="num">{total}</span> pertanyaan dalam <span className="num">{index.length}</span> kategori</>}
          </p>

          {shown.length === 0 ? (
            <Card className="mt-4 flex flex-col items-center px-6 py-12 text-center">
              <SearchX size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">Tidak ada hasil</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Coba kata lain, atau hubungi {isHr ? 'admin sistem' : 'HR'} lewat kartu kontak di halaman ini.
              </p>
              <Button variant="secondary" className="mt-5" onClick={() => setQuery('')}>Hapus pencarian</Button>
            </Card>
          ) : (
            <div className="mt-4 space-y-5">
              {shown.map((c) => {
                const Icon = CATEGORY_ICON[c.id] ?? CircleHelp;
                return (
                  <Card key={c.id} aria-labelledby={`${baseId}-${c.id}`}>
                    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h2 id={`${baseId}-${c.id}`} className="text-[15px] font-semibold leading-6">{c.title}</h2>
                        <p className="text-[13px] text-muted">{c.description}</p>
                      </div>
                    </div>
                    <ul className="divide-y divide-line">
                      {c.items.map((it) => {
                        const key = `${c.id}-${it.id}`;
                        return (
                          <FaqItem
                            key={key}
                            item={it}
                            idPrefix={`${baseId}-${key}`}
                            open={open.has(key)}
                            onToggle={() => toggle(key)}
                          />
                        );
                      })}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24" aria-label={isHr ? 'Kontak admin sistem' : 'Kontak HR'}>
          <ContactCard variant={isHr ? 'admin' : 'hr'} />
        </aside>
      </div>
    </>
  );
}
