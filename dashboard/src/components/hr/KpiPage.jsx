import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, CalendarRange, RefreshCw, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { PageHeader, Card, Badge, IconButton, useToast, cx } from '../ui';
import KpiPeriodsTab from './KpiPeriodsTab';
import { templateStatus, kpiError, useKpiPositions } from '../../lib/kpi';

const TABS = [
  { id: 'template', label: 'Template', icon: ClipboardList },
  { id: 'periode', label: 'Periode', icon: CalendarRange },
];

const FILTERS = [
  { id: 'semua', label: 'Semua jabatan' },
  { id: 'berkaryawan', label: 'Punya karyawan aktif' },
  { id: 'perhatian', label: 'Perlu perhatian' },
];

function TemplatesTab({ positions }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('berkaryawan');
  const { rows, loading, error, reload } = positions;

  const staffed = rows.filter((r) => r.active_employees > 0);
  const ready = staffed.filter((r) => r.is_valid).length;
  const attention = staffed.filter((r) => !r.is_valid);
  const counts = { semua: rows.length, berkaryawan: staffed.length, perhatian: attention.length };
  const visible = filter === 'semua' ? rows : filter === 'berkaryawan' ? staffed : attention;
  const open = (id) => navigate(`/hr/kpi/template/${id}`);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Template per jabatan</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {loading && rows.length === 0 ? 'Memuat…' : (
              <><span className="num">{ready}</span> dari <span className="num">{staffed.length}</span> jabatan yang punya karyawan aktif sudah punya template valid.</>
            )}
          </p>
        </div>
        <IconButton label="Muat ulang" className="h-8 w-8" onClick={reload} disabled={loading}>
          <RefreshCw size={15} className={cx(loading && 'animate-spin')} />
        </IconButton>
      </div>

      <div role="group" aria-label="Filter jabatan" className="flex gap-1 overflow-x-auto border-b border-line px-5 py-2.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              'h-8 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors',
              filter === f.id ? 'bg-subtle text-fg ring-1 ring-line-strong' : 'text-muted hover:text-fg',
            )}
          >
            {f.label} <span className="num text-faint">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-faint">
              <th scope="col" className="px-5 py-2.5 font-medium">Jabatan</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Karyawan aktif</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Indikator</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Total bobot</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Buka</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">
                <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat jabatan…
              </td></tr>
            )}
            {!loading && error && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-danger">
                <AlertCircle size={18} className="mr-2 inline" aria-hidden="true" />{kpiError(error, 'Data gagal dimuat. Coba muat ulang.')}
              </td></tr>
            )}
            {!loading && !error && visible.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">
                {filter === 'perhatian' ? 'Semua jabatan yang punya karyawan aktif sudah punya template valid.' : 'Tidak ada jabatan.'}
              </td></tr>
            )}
            {!error && visible.map((r) => {
              const st = templateStatus(r);
              return (
                <tr
                  key={r.position_id}
                  tabIndex={0}
                  onClick={() => open(r.position_id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.position_id); } }}
                  aria-label={`${st.key === 'none' ? 'Buat' : 'Ubah'} template KPI ${r.position_name}`}
                  className="cursor-pointer transition-colors hover:bg-subtle"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium">{r.position_name}</p>
                    <p className="text-xs text-faint">{r.division_name ?? '—'}</p>
                  </td>
                  <td className={cx('num px-5 py-3 text-right', r.active_employees === 0 && 'text-faint')}>{r.active_employees}</td>
                  <td className="num px-5 py-3 text-right">{r.indicator_count || <span className="text-faint">—</span>}</td>
                  <td className={cx('num px-5 py-3 text-right', st.key === 'invalid' && 'font-medium text-warning')}>
                    {r.indicator_count ? `${r.total_weight}%` : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3"><Badge tone={st.tone} dot={st.key !== 'none'}>{st.label}</Badge></td>
                  <td className="px-3 py-3 text-faint"><ChevronRight size={16} aria-hidden="true" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* /hr/kpi/:tab — Template & Periode. */
export default function KpiPage({ tab }) {
  const navigate = useNavigate();
  const positions = useKpiPositions();
  const [toast, toastNode] = useToast();
  const active = TABS.some((t) => t.id === tab) ? tab : 'template';
  const panelId = 'kpi-panel';

  return (
    <>
      <PageHeader
        title="Evaluasi kinerja"
        description="Template KPI per jabatan dan periode penilaian kuartalan."
      />

      <div role="tablist" aria-label="Evaluasi kinerja" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`kpi-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              onClick={() => navigate(`/hr/kpi/${t.id}`)}
              className={cx(
                '-mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors',
                selected ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              <Icon size={16} strokeWidth={selected ? 2.1 : 1.8} aria-hidden="true" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={`kpi-tab-${active}`}>
        {active === 'periode'
          ? <KpiPeriodsTab positions={positions} toast={toast} />
          : <TemplatesTab positions={positions} />}
      </div>
      {toastNode}
    </>
  );
}
