import React from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, ChevronRight, RefreshCw, CalendarRange, TriangleAlert } from 'lucide-react';
import { Card, Badge, Button, IconButton, Avatar, Eyebrow, inputCls, cx } from '../ui';
import { formatDate, todayWIB } from '../../lib/hr';
import { dateTimeJakarta } from '../../lib/leave';
import {
  PERIOD_STATUS, REVIEW_STATUS, GRADE_TONE, reviewStatusKey, scoreSummary, formatScore, gradeOf,
  kpiError, useKpiPeriods, useKpiReviews,
} from '../../lib/kpi';

const STATUS_FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'belum', label: 'Belum dinilai' },
  { id: 'draft', label: 'Draft' },
  { id: 'final', label: 'Final' },
];

/** Skor yang tampil di daftar: final, atau pratinjau draft dari skor tersimpan. */
function rowScore(r) {
  if (r.status === 'final') return { score: Number(r.final_score), grade: r.grade, preview: false };
  if (!r.reviewer_id) return null;
  const s = scoreSummary(r.scores ?? []);
  return s.complete ? { score: s.score, grade: gradeOf(s.score), preview: true } : null;
}

function Progress({ period, rows }) {
  const total = rows.length;
  const counts = { belum: 0, draft: 0, final: 0 };
  rows.forEach((r) => { counts[reviewStatusKey(r)] += 1; });
  const finals = rows.filter((r) => r.status === 'final');
  const avg = finals.length ? Math.round((finals.reduce((n, r) => n + Number(r.final_score), 0) / finals.length) * 10) / 10 : null;
  const pct = total ? Math.round((counts.final / total) * 100) : 0;
  const overdue = period.status === 'aktif' && todayWIB() > period.deadline && counts.final < total;

  return (
    <div className="grid gap-6 p-5 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted">Sudah dinilai</span>
          <span className="num font-medium">{counts.final} / {total}</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-subtle"
          role="progressbar" aria-valuenow={counts.final} aria-valuemin={0} aria-valuemax={total} aria-label="Progres penilaian KPI"
        >
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          <span><span className="num font-medium text-fg">{counts.belum}</span> belum dinilai</span>
          <span><span className="num font-medium text-fg">{counts.draft}</span> draft</span>
          <span><span className="num font-medium text-fg">{counts.final}</span> final</span>
        </p>
        {overdue && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-warning">
            <TriangleAlert size={14} aria-hidden="true" /> Tenggat {formatDate(period.deadline)} sudah lewat.
          </p>
        )}
      </div>
      <div>
        <Eyebrow>Rata-rata skor final</Eyebrow>
        <p className="mt-1 font-display text-2xl font-semibold">
          <span className="num">{formatScore(avg)}</span>
          <span className="text-sm font-medium text-faint"> / 100</span>
        </p>
        <p className="text-[13px] text-muted">{avg == null ? 'Belum ada penilaian final' : `Grade ${gradeOf(avg)}`}</p>
      </div>
    </div>
  );
}

export default function KpiReviewsTab() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const periods = useKpiPeriods();

  // Periode yang bisa dilihat: aktif dan selesai (draft belum punya penilaian).
  const options = periods.rows.filter((p) => p.status !== 'draft');
  const requested = params.get('periode');
  const period = options.find((p) => p.id === requested)
    ?? options.find((p) => p.status === 'aktif') ?? options[0] ?? null;
  const reviews = useKpiReviews(period?.id ?? null);

  const division = params.get('divisi') ?? '';
  const status = STATUS_FILTERS.some((f) => f.id === params.get('status')) ? params.get('status') : 'semua';
  const setParam = (key, value, fallback) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const divisions = [...new Map(
    reviews.rows.filter((r) => r.employee?.division).map((r) => [r.employee.division.id, r.employee.division.name]),
  )].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  const inDivision = division ? reviews.rows.filter((r) => r.employee?.division?.id === division) : reviews.rows;
  const counts = { semua: inDivision.length, belum: 0, draft: 0, final: 0 };
  inDivision.forEach((r) => { counts[reviewStatusKey(r)] += 1; });
  const visible = status === 'semua' ? inDivision : inDivision.filter((r) => reviewStatusKey(r) === status);

  const open = (id) => navigate(`/hr/kpi/penilaian/${id}`, { state: { from: location.pathname + location.search } });
  const reload = () => { periods.reload(); reviews.reload(); };

  if (periods.loading && periods.rows.length === 0) {
    return (
      <Card className="px-6 py-16 text-center text-sm text-muted">
        <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat periode…
      </Card>
    );
  }
  if (periods.error) {
    return (
      <Card className="px-6 py-16 text-center">
        <p className="text-sm text-danger"><AlertCircle size={16} className="mr-1.5 inline" aria-hidden="true" />{kpiError(periods.error, 'Periode gagal dimuat.')}</p>
        <Button variant="secondary" className="mt-4" onClick={periods.reload}>Coba lagi</Button>
      </Card>
    );
  }
  if (!period) {
    return (
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <CalendarRange size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold">Belum ada periode aktif</h2>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Aktifkan periode di tab Periode. Draft penilaian dibuat otomatis untuk setiap karyawan aktif.
        </p>
        <Button variant="secondary" className="mt-5" onClick={() => navigate('/hr/kpi/periode')}>Buka tab Periode</Button>
      </Card>
    );
  }

  const st = PERIOD_STATUS[period.status];

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <label htmlFor="kpi-review-period" className="sr-only">Periode</label>
            <select
              id="kpi-review-period"
              value={period.id}
              onChange={(e) => {
                const next = new URLSearchParams();
                next.set('periode', e.target.value);
                setParams(next, { replace: true });
              }}
              className={cx(inputCls, 'h-9 w-auto pr-8 font-medium')}
            >
              {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.status === 'aktif' ? ' (aktif)' : ''}</option>)}
            </select>
            <Badge tone={st.tone} dot>{st.label}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[13px] text-muted">Tenggat <span className="num font-medium text-fg">{formatDate(period.deadline)}</span></p>
            <IconButton label="Muat ulang" className="h-8 w-8" onClick={reload} disabled={reviews.loading}>
              <RefreshCw size={15} className={cx(reviews.loading && 'animate-spin')} />
            </IconButton>
          </div>
        </div>
        {period.status !== 'aktif' && (
          <p className="border-b border-line bg-subtle px-5 py-2.5 text-[13px] text-muted">
            Periode ini sudah selesai. Penilaian hanya bisa dilihat, tidak bisa diubah.
          </p>
        )}
        {reviews.rows.length > 0 && <Progress period={period} rows={reviews.rows} />}
      </Card>

      <Card className="mt-5">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filter status" className="flex gap-1 overflow-x-auto">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={status === f.id}
                onClick={() => setParam('status', f.id, 'semua')}
                className={cx(
                  'h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors',
                  status === f.id ? 'bg-subtle text-fg ring-1 ring-line-strong' : 'text-muted hover:text-fg',
                )}
              >
                {f.label} <span className="num text-faint">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="kpi-review-division" className="text-[13px] text-muted">Divisi</label>
            <select
              id="kpi-review-division"
              value={division}
              onChange={(e) => setParam('divisi', e.target.value, '')}
              className={cx(inputCls, 'h-9 w-full pr-8 lg:w-56')}
            >
              <option value="">Semua divisi</option>
              {divisions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Karyawan</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Jabatan</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Skor</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Grade</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Terakhir diubah</th>
                <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Buka</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reviews.loading && reviews.rows.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">
                  <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat penilaian…
                </td></tr>
              )}
              {!reviews.loading && reviews.error && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-danger">
                  <AlertCircle size={18} className="mr-2 inline" aria-hidden="true" />{kpiError(reviews.error, 'Penilaian gagal dimuat. Coba muat ulang.')}
                </td></tr>
              )}
              {!reviews.loading && !reviews.error && visible.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">
                  {reviews.rows.length === 0
                    ? `Tidak ada penilaian di ${period.name}.`
                    : 'Tidak ada karyawan yang cocok dengan filter.'}
                </td></tr>
              )}
              {!reviews.error && visible.map((r) => {
                const key = reviewStatusKey(r);
                const rs = REVIEW_STATUS[key];
                const sc = rowScore(r);
                const name = r.employee?.full_name ?? 'Karyawan';
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => open(r.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.id); } }}
                    aria-label={`${key === 'final' ? 'Lihat' : 'Nilai'} KPI ${name}`}
                    className="cursor-pointer transition-colors hover:bg-subtle"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} src={r.employee?.photo_url} size={32} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {name}
                            {r.employee && !r.employee.is_active && <span className="ml-1.5 text-xs font-normal text-faint">(nonaktif)</span>}
                          </p>
                          <p className="num text-xs text-faint">{r.employee?.nip ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p>{r.position?.name ?? '—'}</p>
                      <p className="text-xs text-faint">{r.employee?.division?.name ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3"><Badge tone={rs.tone} dot={key !== 'belum'}>{rs.label}</Badge></td>
                    <td className={cx('num px-5 py-3 text-right', sc?.preview && 'text-muted')}>
                      {sc ? formatScore(sc.score) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {sc ? (
                        <Badge tone={sc.preview ? 'neutral' : GRADE_TONE[sc.grade]} className="num">
                          {sc.grade}{sc.preview && <span className="font-normal"> · sementara</span>}
                        </Badge>
                      ) : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">
                      {key === 'belum' ? <span className="text-faint">—</span> : (
                        <>
                          <p className="num">{dateTimeJakarta(r.status === 'final' ? r.finalized_at : r.updated_at)}</p>
                          <p className="text-faint">{r.reviewer?.full_name ?? '—'}</p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-faint"><ChevronRight size={16} aria-hidden="true" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
