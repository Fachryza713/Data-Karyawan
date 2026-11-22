import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Paperclip, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import {
  Card, Badge, Button, IconButton, Modal, Avatar, Field, Pagination, cx, inputCls,
} from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { REQUEST_STATUS, KIND_LABEL, rpcMessage, attachmentUrl, dateTimeJakarta } from '../../lib/leave';
import { formatDate } from '../../lib/hr';

const PENDING_PREVIEW = 5;
const HISTORY_PER_PAGE = 10;

const REQUEST_FIELDS = `
  id, employee_id, kind, start_date, end_date, working_days, reason, destination, attachment_path,
  status, review_note, reviewed_at, created_at,
  leave_type:leave_types(code, name, deducts_quota),
  employee:profiles!requests_employee_id_fkey(full_name, nip, photo_url, division:divisions(name), position:positions(name)),
  reviewer:profiles!requests_reviewed_by_fkey(full_name)
`;

const PENDING_FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'cuti', label: 'Cuti & izin' },
  { id: 'sakit', label: 'Sakit' },
  { id: 'remote', label: 'WFH & dinas' },
];

const HISTORY_FILTERS = [
  { value: 'semua', label: 'Semua status' },
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'ditolak', label: 'Ditolak' },
];

const VIEWS = [
  { id: 'menunggu', label: 'Menunggu persetujuan' },
  { id: 'riwayat', label: 'Riwayat' },
];

const category = (r) => (r.kind !== 'leave' ? 'remote' : r.leave_type?.code === 'sakit' ? 'sakit' : 'cuti');
const typeLabel = (r) => r.leave_type?.name ?? KIND_LABEL[r.kind];
const typeTone = (r) => {
  if (r.kind !== 'leave') return 'neutral';
  if (r.leave_type?.code === 'sakit') return 'warning';
  return r.leave_type?.deducts_quota ? 'accent' : 'neutral';
};
const rangeText = (r) => (r.start_date === r.end_date
  ? formatDate(r.start_date)
  : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`);
const employeeMeta = (r) => [r.employee?.position?.name, r.employee?.division?.name].filter(Boolean).join(' · ') || '—';

/** Kirim keputusan ke server. decision = 'disetujui' | 'ditolak'. */
const reviewRequest = (id, decision, note = null) =>
  supabase.rpc('review_request', { p_id: id, p_decision: decision, p_note: note });

/** Pengajuan menunggu, tanggal mulai terdekat dulu. Milik HR sendiri tidak ditampilkan (tidak bisa diproses). */
function usePendingRequests() {
  const { profile } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.from('requests')
      .select(REQUEST_FIELDS)
      .eq('status', 'menunggu')
      .neq('employee_id', profile.id)
      .order('start_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);
    setState({ loading: false, error, rows: data ?? [] });
  }, [profile.id]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Riwayat pengajuan yang sudah diproses HR, terbaru dulu, dipaginasi di server. */
function useRequestHistory(status, page, enabled) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], total: 0 });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const from = (page - 1) * HISTORY_PER_PAGE;
    const { data, error, count } = await supabase.from('requests')
      .select(REQUEST_FIELDS, { count: 'exact' })
      .in('status', status === 'semua' ? ['disetujui', 'ditolak'] : [status])
      .order('reviewed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, from + HISTORY_PER_PAGE - 1);
    setState({ loading: false, error, rows: data ?? [], total: count ?? 0 });
  }, [status, page]);
  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  return { ...state, reload: load };
}

/** Saldo cuti tahunan karyawan pada tahun tanggal mulai (hanya untuk jenis yang memotong kuota). */
function useBalanceFor(r) {
  const deducts = r.kind === 'leave' && !!r.leave_type?.deducts_quota;
  const year = Number(r.start_date.slice(0, 4));
  const [state, setState] = useState({ loading: deducts, balance: null });
  useEffect(() => {
    if (!deducts) return undefined;
    let cancelled = false;
    supabase.from('leave_balances').select('quota, used')
      .eq('employee_id', r.employee_id).eq('year', year).maybeSingle()
      .then(({ data }) => { if (!cancelled) setState({ loading: false, balance: data ?? null }); });
    return () => { cancelled = true; };
  }, [deducts, r.employee_id, year]);
  return { deducts, year, ...state };
}

/** Pratinjau lampiran privat lewat signed URL (berlaku 5 menit). */
function AttachmentPreview({ path }) {
  const [state, setState] = useState({ loading: true, url: null });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, url: null });
    attachmentUrl(path).then((url) => { if (!cancelled) setState({ loading: false, url }); });
    return () => { cancelled = true; };
  }, [path]);

  if (state.loading) {
    return (
      <div className="flex h-32 items-center justify-center gap-2 rounded-lg border border-line bg-subtle text-[13px] text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Memuat lampiran…
      </div>
    );
  }
  if (!state.url) {
    return <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">Lampiran gagal dimuat.</p>;
  }
  return (
    <div>
      {/\.pdf$/i.test(path) ? (
        <iframe src={state.url} title="Pratinjau lampiran" className="h-80 w-full rounded-lg border border-line bg-subtle" />
      ) : (
        <img src={state.url} alt="Lampiran pengajuan" className="max-h-80 w-full rounded-lg border border-line bg-subtle object-contain" />
      )}
      <a
        href={state.url} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
      >
        Buka di tab baru <ExternalLink size={12} aria-hidden="true" />
      </a>
    </div>
  );
}

function QuotaInfo({ r, bal }) {
  if (bal.loading) return <span className="text-faint">Memuat…</span>;
  if (!bal.balance) return <span className="text-faint">Saldo {bal.year} belum tersedia</span>;
  const { quota, used } = bal.balance;
  const after = quota - used - r.working_days;
  return (
    <>
      <span className="num font-medium">{quota - used} hari</span>
      <span className="text-faint"> dari <span className="num">{quota}</span></span>
      {r.status === 'menunggu' && (
        <span className={cx('block text-[13px]', after < 0 ? 'text-danger' : 'text-muted')}>
          Setelah disetujui: <span className="num">{after}</span> hari{after < 0 && ' (kuota tidak cukup)'}
        </span>
      )}
    </>
  );
}

/** Detail pengajuan + Setujui / Tolak. `initialRejecting` membuka langsung input catatan penolakan. */
function RequestDetailModal({ request: r, initialRejecting, onClose, onReviewed, onFailed }) {
  const pending = r.status === 'menunggu';
  const [rejecting, setRejecting] = useState(pending && initialRejecting);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // keputusan yang sedang dikirim
  const noteRef = useRef(null);
  const bal = useBalanceFor(r);
  const st = REQUEST_STATUS[r.status];

  // Ditunda satu tick: Modal memfokuskan panelnya sendiri saat pertama dibuka.
  useEffect(() => {
    if (!rejecting) return undefined;
    const t = setTimeout(() => noteRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [rejecting]);

  const submit = async (decision) => {
    if (busy) return;
    if (decision === 'ditolak' && !note.trim()) {
      setNoteError('Tuliskan alasan penolakan.');
      noteRef.current?.focus();
      return;
    }
    setBusy(decision);
    setError(null);
    const { error: err } = await reviewRequest(r.id, decision, decision === 'ditolak' ? note.trim() : null);
    setBusy(null);
    if (err) {
      setError(rpcMessage(err, 'Pengajuan gagal diproses. Coba lagi.'));
      onFailed?.();
      return;
    }
    onReviewed(r, decision);
  };

  let footer = <Button variant="secondary" onClick={onClose}>Tutup</Button>;
  if (pending && rejecting) {
    footer = (
      <>
        <Button variant="ghost" onClick={() => { setRejecting(false); setNoteError(null); }} disabled={!!busy}>Kembali</Button>
        <Button variant="danger" onClick={() => submit('ditolak')} disabled={!!busy} aria-busy={busy === 'ditolak' || undefined}>
          {busy === 'ditolak' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
          Tolak pengajuan
        </Button>
      </>
    );
  } else if (pending) {
    footer = (
      <>
        <Button variant="ghost" onClick={onClose} disabled={!!busy}>Tutup</Button>
        <Button variant="danger" onClick={() => setRejecting(true)} disabled={!!busy}>
          <X size={16} aria-hidden="true" /> Tolak
        </Button>
        <Button onClick={() => submit('disetujui')} disabled={!!busy} aria-busy={busy === 'disetujui' || undefined}>
          {busy === 'disetujui' ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
          Setujui
        </Button>
      </>
    );
  }

  return (
    <Modal
      title={rejecting ? 'Tolak pengajuan' : 'Detail pengajuan'}
      description={`${typeLabel(r)} · ${rangeText(r)}`}
      onClose={busy ? () => {} : onClose}
      footer={footer}
    >
      {error && <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <Avatar name={r.employee?.full_name ?? ''} src={r.employee?.photo_url} size={40} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{r.employee?.full_name ?? '—'}</p>
          <p className="text-[13px] text-faint"><span className="num">{r.employee?.nip ?? '—'}</span> · {employeeMeta(r)}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[112px_1fr] gap-x-3 gap-y-2.5 text-sm">
        <dt className="text-faint">Jenis</dt>
        <dd><Badge tone={typeTone(r)}>{typeLabel(r)}</Badge></dd>
        <dt className="text-faint">Tanggal</dt>
        <dd className="num">{rangeText(r)}</dd>
        <dt className="text-faint">Hari kerja</dt>
        <dd><span className="num">{r.working_days}</span> hari</dd>
        {r.kind === 'dinas' && (
          <>
            <dt className="text-faint">Tujuan</dt>
            <dd className="break-words">{r.destination ?? '—'}</dd>
          </>
        )}
        {bal.deducts && (
          <>
            <dt className="text-faint">Sisa kuota {bal.year}</dt>
            <dd><QuotaInfo r={r} bal={bal} /></dd>
          </>
        )}
        <dt className="text-faint">Alasan</dt>
        <dd className="whitespace-pre-line break-words">{r.reason}</dd>
        <dt className="text-faint">Diajukan</dt>
        <dd className="num">{dateTimeJakarta(r.created_at)}</dd>
        {!pending && (
          <>
            <dt className="text-faint">Status</dt>
            <dd><Badge tone={st.tone} dot>{st.label}</Badge></dd>
            <dt className="text-faint">Diproses</dt>
            <dd>
              <span className="num">{dateTimeJakarta(r.reviewed_at)}</span>
              {r.reviewer?.full_name && <span className="text-muted"> · {r.reviewer.full_name}</span>}
            </dd>
            {r.review_note && (
              <>
                <dt className="text-faint">Catatan HR</dt>
                <dd className="whitespace-pre-line break-words">{r.review_note}</dd>
              </>
            )}
          </>
        )}
      </dl>

      {r.attachment_path && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] font-medium">Lampiran</p>
          <AttachmentPreview path={r.attachment_path} />
        </div>
      )}

      {pending && rejecting && (
        <div className="mt-5">
          <Field
            label="Catatan penolakan" required htmlFor="review-note" aside={`${note.length}/500`}
            hint="Catatan ini tampil ke karyawan di daftar Pengajuan saya."
          >
            <textarea
              ref={noteRef} id="review-note" rows={3} maxLength={500} value={note}
              onChange={(e) => { setNote(e.target.value); setNoteError(null); }}
              placeholder="Contoh: tanggal bentrok dengan jadwal rilis proyek"
              aria-invalid={!!noteError || undefined}
              className={cx(inputCls, 'h-auto resize-none py-2', noteError && 'border-danger')}
            />
            <FieldError>{noteError}</FieldError>
          </Field>
        </div>
      )}
    </Modal>
  );
}

function PendingItem({ r, busy, disabled, onApprove, onReject, onOpen }) {
  return (
    <li className="flex flex-col gap-4 px-5 py-4 sm:flex-row">
      <Avatar name={r.employee?.full_name ?? ''} src={r.employee?.photo_url} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-medium">{r.employee?.full_name ?? '—'}</p>
          <p className="text-[13px] text-faint">{employeeMeta(r)}</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          <Badge tone={typeTone(r)}>{typeLabel(r)}</Badge>
          <span className="num text-fg">{rangeText(r)}</span>
          <span className="text-faint">· <span className="num">{r.working_days}</span> hari kerja</span>
        </div>
        {r.kind === 'dinas' && r.destination && (
          <p className="mt-1 break-words text-[13px] text-muted">Tujuan: <span className="text-fg">{r.destination}</span></p>
        )}
        <p className="mt-2 line-clamp-2 break-words text-sm text-muted">{r.reason}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
          <button type="button" onClick={onOpen} className="font-medium text-accent-text hover:underline">Lihat detail</button>
          {r.attachment_path && (
            <span className="inline-flex items-center gap-1"><Paperclip size={12} aria-hidden="true" /> Ada lampiran</span>
          )}
          <span>Diajukan <span className="num">{dateTimeJakarta(r.created_at)}</span></span>
        </div>
      </div>
      <div className="flex gap-2 sm:flex-col">
        <Button size="sm" onClick={onApprove} disabled={disabled} aria-busy={busy || undefined}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          Setujui
        </Button>
        <Button size="sm" variant="danger" onClick={onReject} disabled={disabled}>
          <X size={14} aria-hidden="true" /> Tolak
        </Button>
      </div>
    </li>
  );
}

function HistoryItem({ r, onOpen }) {
  const st = REQUEST_STATUS[r.status];
  return (
    <li>
      <button
        type="button" onClick={onOpen}
        className="flex w-full flex-col gap-2 px-5 py-3.5 text-left transition-colors hover:bg-subtle sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={r.employee?.full_name ?? ''} src={r.employee?.photo_url} size={32} />
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{r.employee?.full_name ?? '—'}</span>
              <span className="text-faint"> · {typeLabel(r)}</span>
            </p>
            <p className="text-[13px] text-muted">
              <span className="num">{rangeText(r)}</span>
              <span className="text-faint"> · <span className="num">{r.working_days}</span> hari kerja</span>
            </p>
            {r.review_note && <p className="mt-0.5 line-clamp-1 break-words text-[13px] text-faint">Catatan: {r.review_note}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-11 sm:flex-col sm:items-end sm:gap-1 sm:pl-0">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <span className="text-xs text-faint">
            <span className="num">{dateTimeJakarta(r.reviewed_at)}</span>
            {r.reviewer?.full_name && ` · ${r.reviewer.full_name}`}
          </span>
        </div>
      </button>
    </li>
  );
}

function ListMessage({ children, error, onRetry }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className={cx('text-sm', error ? 'text-danger' : 'text-muted')}>{children}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Coba lagi</Button>}
    </div>
  );
}

/**
 * Antrean persetujuan HR (cuti, sakit, izin, WFH, dinas) + riwayat yang sudah diproses.
 * `toast(msg, type)` dari halaman induk. `onChanged()` dipanggil setelah keputusan tersimpan.
 */
export default function RequestsReviewCard({ className, toast, onChanged }) {
  const [view, setView] = useState('menunggu');
  const [kindFilter, setKindFilter] = useState('semua');
  const [showAll, setShowAll] = useState(false);
  const [historyStatus, setHistoryStatus] = useState('semua');
  const [historyPage, setHistoryPage] = useState(1);
  const [detail, setDetail] = useState(null); // { request, rejecting }
  const [busyId, setBusyId] = useState(null);
  const pending = usePendingRequests();
  const history = useRequestHistory(historyStatus, historyPage, view === 'riwayat');

  const counts = useMemo(() => {
    const c = { semua: pending.rows.length, cuti: 0, sakit: 0, remote: 0 };
    pending.rows.forEach((r) => { c[category(r)] += 1; });
    return c;
  }, [pending.rows]);

  const filtered = kindFilter === 'semua' ? pending.rows : pending.rows.filter((r) => category(r) === kindFilter);
  const visible = showAll ? filtered : filtered.slice(0, PENDING_PREVIEW);
  const hiddenCount = filtered.length - visible.length;
  const historyPages = Math.max(1, Math.ceil(history.total / HISTORY_PER_PAGE));

  const afterReview = (r, decision) => {
    const name = r.employee?.full_name ?? 'karyawan';
    toast(
      decision === 'disetujui' ? `Pengajuan ${name} disetujui.` : `Pengajuan ${name} ditolak.`,
      decision === 'disetujui' ? 'success' : 'error',
    );
    pending.reload();
    if (view === 'riwayat') history.reload();
    onChanged?.();
  };

  const approveInline = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    const { error } = await reviewRequest(r.id, 'disetujui');
    setBusyId(null);
    if (error) {
      toast(rpcMessage(error, 'Pengajuan gagal diproses. Coba lagi.'), 'error');
      pending.reload();
      return;
    }
    afterReview(r, 'disetujui');
  };

  const current = view === 'menunggu' ? pending : history;

  return (
    <Card className={className}>
      <div className="flex items-end justify-between gap-3 border-b border-line px-5 pt-2">
        <div role="tablist" aria-label="Pengajuan" className="flex gap-1 overflow-x-auto">
          {VIEWS.map((t) => {
            const selected = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`req-tab-${t.id}`}
                aria-selected={selected}
                aria-controls="req-panel"
                onClick={() => setView(t.id)}
                className={cx(
                  '-mb-px inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                  selected ? 'border-accent font-semibold text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {t.label}
                {t.id === 'menunggu' && !pending.loading && (
                  <span className="num rounded-md bg-subtle px-1.5 text-xs font-medium text-muted">{pending.rows.length}</span>
                )}
              </button>
            );
          })}
        </div>
        <IconButton label="Muat ulang" className="mb-1.5 h-8 w-8 shrink-0" onClick={current.reload} disabled={current.loading}>
          <RefreshCw size={15} className={cx(current.loading && 'animate-spin')} />
        </IconButton>
      </div>

      <div role="tabpanel" id="req-panel" aria-labelledby={`req-tab-${view}`}>
        {view === 'menunggu' ? (
          <>
            <div role="group" aria-label="Filter jenis pengajuan" className="flex gap-1 overflow-x-auto border-b border-line px-5 py-2.5">
              {PENDING_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={kindFilter === f.id}
                  onClick={() => { setKindFilter(f.id); setShowAll(false); }}
                  className={cx(
                    'h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors',
                    kindFilter === f.id ? 'bg-subtle text-fg ring-1 ring-line-strong' : 'text-muted hover:text-fg',
                  )}
                >
                  {f.label} <span className="num text-faint">{counts[f.id]}</span>
                </button>
              ))}
            </div>

            {pending.error ? (
              <ListMessage error onRetry={pending.reload}>Pengajuan gagal dimuat.</ListMessage>
            ) : pending.loading && pending.rows.length === 0 ? (
              <ListMessage>Memuat…</ListMessage>
            ) : visible.length === 0 ? (
              <ListMessage>Tidak ada pengajuan yang menunggu.</ListMessage>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((r) => (
                  <PendingItem
                    key={r.id}
                    r={r}
                    busy={busyId === r.id}
                    disabled={!!busyId}
                    onApprove={() => approveInline(r)}
                    onReject={() => setDetail({ request: r, rejecting: true })}
                    onOpen={() => setDetail({ request: r, rejecting: false })}
                  />
                ))}
              </ul>
            )}

            {hiddenCount > 0 && (
              <div className="border-t border-line px-5 py-3 text-center">
                <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-medium text-accent-text hover:underline">
                  Tampilkan {hiddenCount} lainnya
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
              <p className="text-[13px] text-muted">
                {history.loading ? 'Memuat…' : <><span className="num">{history.total}</span> pengajuan diproses</>}
              </p>
              <label htmlFor="req-history-status" className="sr-only">Status</label>
              <select
                id="req-history-status"
                value={historyStatus}
                onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
                className={cx(inputCls, 'h-8 w-auto pr-8 text-[13px]')}
              >
                {HISTORY_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {history.error ? (
              <ListMessage error onRetry={history.reload}>Riwayat gagal dimuat.</ListMessage>
            ) : history.loading && history.rows.length === 0 ? (
              <ListMessage>Memuat…</ListMessage>
            ) : history.rows.length === 0 ? (
              <ListMessage>Belum ada pengajuan yang diproses.</ListMessage>
            ) : (
              <ul className="divide-y divide-line">
                {history.rows.map((r) => (
                  <HistoryItem key={r.id} r={r} onOpen={() => setDetail({ request: r, rejecting: false })} />
                ))}
              </ul>
            )}

            {history.total > HISTORY_PER_PAGE && (
              <Pagination
                page={historyPage}
                totalPages={historyPages}
                onChange={setHistoryPage}
                summary={`Halaman ${historyPage} dari ${historyPages}`}
              />
            )}
          </>
        )}
      </div>

      {detail && (
        <RequestDetailModal
          key={detail.request.id}
          request={detail.request}
          initialRejecting={detail.rejecting}
          onClose={() => setDetail(null)}
          onReviewed={(r, decision) => { setDetail(null); afterReview(r, decision); }}
          onFailed={pending.reload}
        />
      )}
    </Card>
  );
}
