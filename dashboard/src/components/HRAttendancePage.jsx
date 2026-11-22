import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Clock, RefreshCw, MapPin, Search, ExternalLink, Loader2,
} from 'lucide-react';
import {
  PageHeader, Card, Badge, Button, IconButton, Modal, Avatar, Eyebrow, Field, Pagination, useToast, inputCls, cx,
} from './ui';
import RequestsReviewCard from './hr/RequestsReviewCard';
import { supabase } from '../lib/supabase';
import {
  LOG_STATUS, STATUS_LABEL, MODE_LABEL, isoJakarta, addDays, rpcAll, downloadCsv, mapsUrl, formatDistance,
} from '../lib/attendance';
import { timeJakarta } from '../lib/useTodayAttendance';
import { formatDate } from '../lib/hr';


/* ── Log presensi (data dari RPC hr_attendance_log / hr_attendance_summary) ── */
const PER_PAGE = 25;
const MAX_EXPORT_DAYS = 93;

const STATUS_FILTERS = [
  { value: 'semua', label: 'Semua status' },
  ...['tepat_waktu', 'terlambat', 'cuti_sakit', 'luar_radius', 'belum_absen', 'alpa']
    .map((v) => ({ value: v, label: LOG_STATUS[v].label })),
];

const longDate = (iso) =>
  new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

function rpcError(error, fallback) {
  if (['42501', '22023'].includes(error?.code) && error.message) return error.message;
  return fallback;
}

/** Label status untuk satu baris log (dipakai tabel dan CSV). */
function statusText(row) {
  if (row.log_status === 'belum_absen') return row.is_workday ? 'Belum absen' : 'Libur';
  if (row.log_status === 'terlambat') return `Terlambat ${row.late_minutes} mnt`;
  if (row.log_status === 'cuti_sakit' || row.log_status === 'alpa') return STATUS_LABEL[row.status];
  if (row.log_status === 'luar_radius') return `${MODE_LABEL[row.mode]}${row.late_minutes > 0 ? ` · terlambat ${row.late_minutes} mnt` : ''}`;
  return 'Tepat waktu';
}

function LogStatusBadge({ row }) {
  const meta = LOG_STATUS[row.log_status];
  const tone = row.log_status === 'belum_absen' && !row.is_workday ? 'neutral' : meta.tone;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <Badge tone={tone} dot={!!row.clock_in_at}>{statusText(row)}</Badge>
      {row.status === 'pulang_cepat' && <Badge tone="warning">Pulang cepat</Badge>}
    </span>
  );
}

function useAttendanceLog(date) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], summary: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const [log, sum] = await Promise.all([
      rpcAll('hr_attendance_log', { p_from: date, p_to: date }),
      supabase.rpc('hr_attendance_summary', { p_date: date }),
    ]);
    const error = log.error || sum.error;
    setState({ loading: false, error, rows: log.data ?? [], summary: sum.data?.[0] ?? null });
  }, [date]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Satu sisi (masuk/pulang) di modal detail. */
function PointDetail({ title, at, lat, lng, distance, accuracy }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <Eyebrow>{title}</Eyebrow>
      {at ? (
        <dl className="mt-2 grid grid-cols-[88px_1fr] gap-y-1.5 text-sm">
          <dt className="text-faint">Jam</dt><dd className="num font-medium">{timeJakarta(at)} WIB</dd>
          <dt className="text-faint">Koordinat</dt>
          <dd className="num">{lat != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : '—'}</dd>
          <dt className="text-faint">Jarak</dt><dd className="num">{formatDistance(distance) ?? '—'}</dd>
          <dt className="text-faint">Akurasi</dt><dd className="num">{accuracy != null ? `± ${Math.round(accuracy)} m` : '—'}</dd>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-faint">Belum tercatat.</p>
      )}
      {at && lat != null && (
        <a
          href={mapsUrl(lat, lng)} target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline"
        >
          Lihat di Google Maps <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

function DetailModal({ row, onClose }) {
  return (
    <Modal
      title={row.full_name}
      description={`${longDate(row.date)} · ${row.office_name ?? 'Kantor belum diatur'}`}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Tutup</Button>}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <LogStatusBadge row={row} />
        {row.mode && <Badge>{MODE_LABEL[row.mode]}</Badge>}
        <span className="num text-faint">{row.nip ?? '—'} · {row.division_name ?? '—'}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PointDetail
          title="Masuk" at={row.clock_in_at} lat={row.clock_in_lat} lng={row.clock_in_lng}
          distance={row.clock_in_distance_m} accuracy={row.clock_in_accuracy_m}
        />
        <PointDetail
          title="Pulang" at={row.clock_out_at} lat={row.clock_out_lat} lng={row.clock_out_lng}
          distance={row.clock_out_distance_m} accuracy={row.clock_out_accuracy_m}
        />
      </div>
    </Modal>
  );
}

function ExportModal({ defaultDate, onClose, onDone }) {
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (ev) => {
    ev.preventDefault();
    if (!from || !to) return setError('Pilih tanggal mulai dan selesai.');
    if (to < from) return setError('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (daysBetween(from, to) + 1 > MAX_EXPORT_DAYS) return setError(`Rentang maksimal ${MAX_EXPORT_DAYS} hari.`);
    setBusy(true);
    setError(null);
    const { data, error: err } = await rpcAll('hr_attendance_log', { p_from: from, p_to: to });
    setBusy(false);
    if (err) return setError(rpcError(err, 'Ekspor gagal. Coba lagi.'));

    // Hari libur/akhir pekan tanpa catatan tidak ikut diekspor.
    const rows = data.filter((r) => r.is_workday || r.attendance_id);
    downloadCsv(
      `presensi_${from}_${to}.csv`,
      ['Nama', 'NIP', 'Divisi', 'Tanggal', 'Masuk', 'Pulang', 'Status', 'Mode', 'Jarak masuk (m)'],
      rows.map((r) => [
        r.full_name, r.nip, r.division_name, r.date,
        timeJakarta(r.clock_in_at), timeJakarta(r.clock_out_at),
        r.status === 'pulang_cepat' ? `${statusText(r)}, pulang cepat` : statusText(r),
        MODE_LABEL[r.mode], r.clock_in_distance_m,
      ]),
    );
    onDone(`${rows.length} baris diekspor.`);
    return undefined;
  };

  return (
    <Modal
      size="sm"
      title="Ekspor log presensi"
      description={`File CSV untuk rentang tanggal, maksimal ${MAX_EXPORT_DAYS} hari.`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="export-form" disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            {busy ? 'Menyiapkan…' : 'Unduh CSV'}
          </Button>
        </>
      }
    >
      <form id="export-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dari" required htmlFor="exp-from">
            <input id="exp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cx(inputCls, 'num')} />
          </Field>
          <Field label="Sampai" required htmlFor="exp-to">
            <input id="exp-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(inputCls, 'num')} />
          </Field>
        </div>
        <p className="text-xs text-faint">Kolom: nama, NIP, divisi, tanggal, masuk, pulang, status, mode, jarak.</p>
      </form>
    </Modal>
  );
}

/** `onRequestsChanged()` dipanggil setelah HR memproses pengajuan (mis. untuk badge sidebar). */
export default function HRAttendancePage({ onRequestsChanged }) {
  const navigate = useNavigate();
  const [toast, toastNode] = useToast();

  const [date, setDate] = useState(() => isoJakarta());
  const [divisionFilter, setDivisionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [divisions, setDivisions] = useState([]);
  const [detail, setDetail] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const log = useAttendanceLog(date);

  useEffect(() => {
    supabase.from('divisions').select('id, name').order('name').then(({ data }) => setDivisions(data ?? []));
  }, []);

  // Persetujuan cuti mengubah presensi (cuti/sakit/izin), jadi log ikut dimuat ulang.
  const handleRequestsChanged = () => {
    log.reload();
    onRequestsChanged?.();
  };

  const logRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return log.rows.filter((r) =>
      (!divisionFilter || r.division_id === divisionFilter) &&
      (statusFilter === 'semua' || r.log_status === statusFilter) &&
      (!q || r.full_name.toLowerCase().includes(q) || (r.nip ?? '').toLowerCase().includes(q)));
  }, [log.rows, divisionFilter, statusFilter, query]);

  const totalPages = Math.max(1, Math.ceil(logRows.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = logRows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const setFilter = (fn) => (v) => { fn(v); setPage(1); };

  const s = log.summary;
  const isWorkday = log.rows[0]?.is_workday ?? true;
  const metrics = [
    { label: 'Tepat waktu', value: s?.tepat_waktu, note: s?.total ? `${Math.round((s.tepat_waktu / s.total) * 100)}% dari ${s.total} karyawan` : 'Belum ada data' },
    { label: 'Terlambat', value: s?.terlambat, note: s?.avg_late_minutes ? `Rata-rata ${s.avg_late_minutes} menit` : 'Tidak ada', tone: 'text-warning' },
    { label: 'Cuti / sakit', value: s?.cuti_sakit, note: 'Cuti, sakit, dan izin' },
    { label: 'Di luar radius', value: s?.luar_radius, note: 'Absen WFH / dinas luar' },
    { label: 'Belum absen', value: s ? s.belum_absen + s.alpa : undefined, note: s?.alpa ? `${s.alpa} ditandai alpa` : isWorkday ? 'Termasuk yang belum masuk' : 'Hari libur', tone: 'text-danger' },
  ];

  return (
    <>
      <PageHeader
        title="Kehadiran & cuti"
        description={`${longDate(date)}${isWorkday ? '' : ' · hari libur'}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/hr/pengaturan/shift')}><Clock size={16} aria-hidden="true" /> Atur shift</Button>
            <Button variant="secondary" onClick={() => setShowExport(true)}><Download size={16} aria-hidden="true" /> Ekspor</Button>
          </>
        }
      />

      {/* Metrik */}
      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <div key={m.label} className="bg-surface p-5">
              <dt><Eyebrow>{m.label}</Eyebrow></dt>
              <dd className={cx('num mt-1 font-display text-2xl font-semibold', m.value > 0 && m.tone)}>
                {log.loading && !s ? '—' : m.value ?? '—'}
              </dd>
              <dd className="mt-0.5 text-[13px] text-muted">{m.note}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Antrean persetujuan */}
      <RequestsReviewCard className="mt-5" toast={toast} onChanged={handleRequestsChanged} />

      {/* Log presensi */}
      <Card className="mt-5">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Log presensi</h2>
            <IconButton label="Muat ulang" className="h-8 w-8" onClick={log.reload} disabled={log.loading}>
              <RefreshCw size={15} className={cx(log.loading && 'animate-spin')} />
            </IconButton>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_auto]">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => { setDate((d) => addDays(d, -1)); setPage(1); }} aria-label="Hari sebelumnya">‹</Button>
              <label htmlFor="f-date" className="sr-only">Tanggal</label>
              <input
                id="f-date" type="date" value={date} max={isoJakarta()}
                onChange={(e) => { if (e.target.value) { setDate(e.target.value); setPage(1); } }}
                className={cx(inputCls, 'num h-8 w-auto text-[13px]')}
              />
              <Button
                variant="ghost" size="sm" aria-label="Hari berikutnya"
                disabled={date >= isoJakarta()}
                onClick={() => { setDate((d) => addDays(d, 1)); setPage(1); }}
              >›</Button>
            </div>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
              <label htmlFor="f-q" className="sr-only">Cari nama atau NIP</label>
              <input
                id="f-q" type="search" value={query} placeholder="Cari nama atau NIP"
                onChange={(e) => setFilter(setQuery)(e.target.value)}
                className={cx(inputCls, 'h-8 pl-8 text-[13px]')}
              />
            </div>
            <div>
              <label htmlFor="f-div" className="sr-only">Divisi</label>
              <select id="f-div" value={divisionFilter} onChange={(e) => setFilter(setDivisionFilter)(e.target.value)} className={cx(inputCls, 'h-8 pr-8 text-[13px] lg:w-auto')}>
                <option value="">Semua divisi</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-status" className="sr-only">Status</label>
              <select id="f-status" value={statusFilter} onChange={(e) => setFilter(setStatusFilter)(e.target.value)} className={cx(inputCls, 'h-8 pr-8 text-[13px] lg:w-auto')}>
                {STATUS_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {log.error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-danger">{rpcError(log.error, 'Log presensi gagal dimuat.')}</p>
            <Button variant="secondary" className="mt-4" onClick={log.reload}>Coba lagi</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th scope="col" className="px-5 py-2.5 font-medium">Karyawan</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Divisi</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Masuk</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Pulang</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Lokasi</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {log.loading && log.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Memuat…</td></tr>
                )}
                {!log.loading && pageRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Tidak ada data yang cocok dengan filter.</td></tr>
                )}
                {pageRows.map((row) => {
                  const clickable = !!row.clock_in_at;
                  const open = () => clickable && setDetail(row);
                  return (
                    <tr
                      key={row.employee_id}
                      className={cx('transition-colors hover:bg-subtle', clickable && 'cursor-pointer')}
                      onClick={open}
                      onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
                      tabIndex={clickable ? 0 : undefined}
                      aria-label={clickable ? `Lihat detail presensi ${row.full_name}` : undefined}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={row.full_name} size={30} />
                          <div>
                            <p className="font-medium">{row.full_name}</p>
                            <p className="num text-xs text-faint">{row.nip ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p>{row.division_name ?? '—'}</p>
                        <p className="text-xs text-faint">{row.position_name}</p>
                      </td>
                      <td className={cx('num px-5 py-3', row.late_minutes > 0 && 'font-medium text-warning')}>
                        {timeJakarta(row.clock_in_at) ?? <span className="text-faint">—</span>}
                      </td>
                      <td className="num px-5 py-3">{timeJakarta(row.clock_out_at) ?? <span className="text-faint">—</span>}</td>
                      <td className="px-5 py-3">
                        {row.clock_in_at ? (
                          <span className={cx('inline-flex items-center gap-1', row.log_status === 'luar_radius' ? 'font-medium text-danger' : 'text-muted')}>
                            <MapPin size={13} aria-hidden="true" />
                            {row.log_status === 'luar_radius' ? MODE_LABEL[row.mode] : row.office_name}
                            <span className="num text-faint">· {formatDistance(row.clock_in_distance_m)}</span>
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3"><LogStatusBadge row={row} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={safePage}
          totalPages={totalPages}
          onChange={setPage}
          summary={`${logRows.length} dari ${log.rows.length} karyawan · ${formatDate(date)}`}
        />
      </Card>

      {detail && <DetailModal row={detail} onClose={() => setDetail(null)} />}
      {showExport && (
        <ExportModal
          defaultDate={date}
          onClose={() => setShowExport(false)}
          onDone={(msg) => { setShowExport(false); toast(msg); }}
        />
      )}
      {toastNode}
    </>
  );
}
