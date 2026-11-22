import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Loader2, AlertCircle, CheckCircle2, TriangleAlert, Play, Square, CalendarClock, RefreshCw,
} from 'lucide-react';
import { Card, Badge, Button, IconButton, Modal, Field, Segmented, inputCls, cx } from '../ui';
import { FieldError } from '../LoginPage';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/hr';
import { isoJakarta } from '../../lib/attendance';
import { dateTimeJakarta } from '../../lib/leave';
import {
  PERIOD_STATUS, missingTemplates, quarterRange, kpiError, useKpiPeriods,
} from '../../lib/kpi';

const rangeText = (p) => `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`;

function CreatePeriodModal({ existing, onClose, onCreated }) {
  const thisYear = Number(isoJakarta().slice(0, 4));
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const [year, setYear] = useState(thisYear);
  const [quarter, setQuarter] = useState(() => Math.floor((Number(isoJakarta().slice(5, 7)) - 1) / 3) + 1);
  const range = quarterRange(year, quarter);
  const [deadline, setDeadline] = useState(range.end);
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const taken = existing.has(`${year}-${quarter}`);

  // Tenggat default = akhir kuartal, selama HR belum mengubahnya sendiri.
  const pick = (y, q) => {
    setYear(y);
    setQuarter(q);
    setError(null);
    if (!deadlineTouched) setDeadline(quarterRange(y, q).end);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    if (taken) return setError(`Periode Q${quarter} ${year} sudah ada.`);
    if (!deadline) return setError('Tenggat wajib diisi.');
    if (deadline < range.start) return setError('Tenggat tidak boleh sebelum awal periode.');
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('hr_create_kpi_period', { p_year: year, p_quarter: quarter, p_deadline: deadline });
    setBusy(false);
    if (err) return setError(kpiError(err, 'Periode gagal dibuat. Coba lagi.'));
    onCreated(data);
    return undefined;
  };

  return (
    <Modal
      size="sm"
      title="Buat periode"
      description="Periode penilaian per kuartal. Dibuat sebagai draft."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="kpi-period-form" disabled={busy || taken} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Buat periode
          </Button>
        </>
      }
    >
      <form id="kpi-period-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Field label="Tahun" htmlFor="kpi-year">
          <select id="kpi-year" value={year} onChange={(e) => pick(Number(e.target.value), quarter)} className={cx(inputCls, 'pr-8')}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Kuartal">
          <Segmented
            name="Kuartal"
            options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))}
            value={quarter}
            onChange={(q) => pick(year, q)}
          />
        </Field>
        <p className={cx('rounded-lg px-3 py-2 text-[13px]', taken ? 'bg-warning-soft text-warning' : 'bg-subtle text-muted')}>
          {taken ? `Q${quarter} ${year} sudah dibuat.` : (
            <>Q{quarter} {year}: <span className="num">{formatDate(range.start)} – {formatDate(range.end)}</span></>
          )}
        </p>
        <Field label="Tenggat pengisian" required htmlFor="kpi-deadline" hint="Batas akhir HR mengisi penilaian.">
          <input
            id="kpi-deadline" type="date" value={deadline} min={range.start}
            onChange={(e) => { setDeadline(e.target.value); setDeadlineTouched(true); setError(null); }}
            className={cx(inputCls, 'num')}
          />
        </Field>
      </form>
    </Modal>
  );
}

function DeadlineModal({ period, onClose, onSaved }) {
  const [deadline, setDeadline] = useState(period.deadline);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    if (!deadline || deadline < period.start_date) return setError('Tenggat tidak boleh sebelum awal periode.');
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('hr_set_kpi_period_deadline', { p_id: period.id, p_deadline: deadline });
    setBusy(false);
    if (err) return setError(kpiError(err, 'Tenggat gagal disimpan.'));
    onSaved(data);
    return undefined;
  };

  return (
    <Modal
      size="sm"
      title={`Tenggat ${period.name}`}
      description={rangeText(period)}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="kpi-deadline-form" disabled={busy} aria-busy={busy || undefined}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Simpan
          </Button>
        </>
      }
    >
      <form id="kpi-deadline-form" onSubmit={submit} noValidate>
        <Field label="Tenggat pengisian" required htmlFor="kpi-deadline-edit">
          <input
            id="kpi-deadline-edit" type="date" value={deadline} min={period.start_date}
            onChange={(e) => { setDeadline(e.target.value); setError(null); }}
            aria-invalid={!!error || undefined}
            className={cx(inputCls, 'num', error && 'border-danger')}
          />
          <FieldError>{error}</FieldError>
        </Field>
      </form>
    </Modal>
  );
}

function ConfirmModal({ title, children, confirmLabel, icon: Icon, variant = 'primary', onClose, onConfirm }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const msg = await onConfirm();
    setBusy(false);
    if (msg) setError(msg);
  };
  return (
    <Modal
      size="sm"
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button variant={variant} onClick={confirm} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </Modal>
  );
}

/** Kesiapan aktivasi: jabatan berkaryawan aktif tanpa template valid. */
function Readiness({ positions }) {
  const navigate = useNavigate();
  if (positions.loading && positions.rows.length === 0) return null;
  const missing = missingTemplates(positions.rows);
  if (missing.length === 0) {
    return (
      <p className="mb-5 flex items-start gap-2 rounded-lg bg-success-soft px-4 py-3 text-[13px] text-success">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Semua jabatan yang punya karyawan aktif sudah punya template valid. Periode bisa diaktifkan.
      </p>
    );
  }
  return (
    <div role="status" className="mb-5 rounded-lg bg-warning-soft px-4 py-3 text-[13px] text-warning">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Periode belum bisa diaktifkan. <span className="num">{missing.length}</span> jabatan dengan karyawan aktif belum punya template valid:
      </p>
      <ul className="mt-2 flex flex-wrap gap-2 pl-6">
        {missing.map((p) => (
          <li key={p.position_id}>
            <button
              type="button"
              onClick={() => navigate(`/hr/kpi/template/${p.position_id}`)}
              className="rounded-md bg-surface px-2 py-1 font-medium text-fg ring-1 ring-line hover:bg-subtle"
            >
              {p.position_name}
              <span className="font-normal text-faint"> · {p.indicator_count ? `bobot ${p.total_weight}%` : 'belum ada'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KpiPeriodsTab({ positions, toast }) {
  const periods = useKpiPeriods();
  const [modal, setModal] = useState(null); // { type: 'create' | 'deadline' | 'activate' | 'close', period? }
  const existing = new Set(periods.rows.map((p) => `${p.year}-${p.quarter}`));
  const activePeriod = periods.rows.find((p) => p.status === 'aktif');
  const missing = missingTemplates(positions.rows);
  const close = () => setModal(null);

  const runStatus = async (fn, period, message) => {
    const { error } = await supabase.rpc(fn, { p_id: period.id });
    if (error) {
      positions.reload();
      periods.reload();
      return kpiError(error);
    }
    close();
    periods.reload();
    toast(message);
    return null;
  };

  const activateBlocker = activePeriod
    ? `Tutup ${activePeriod.name} terlebih dahulu`
    : missing.length ? 'Masih ada jabatan tanpa template valid' : null;

  return (
    <>
      <Readiness positions={positions} />

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Periode penilaian</h2>
            <p className="mt-0.5 text-[13px] text-muted">Hanya satu periode yang boleh aktif.</p>
          </div>
          <div className="flex items-center gap-2">
            <IconButton label="Muat ulang" className="h-8 w-8" onClick={() => { periods.reload(); positions.reload(); }} disabled={periods.loading}>
              <RefreshCw size={15} className={cx(periods.loading && 'animate-spin')} />
            </IconButton>
            <Button size="sm" onClick={() => setModal({ type: 'create' })}>
              <Plus size={14} aria-hidden="true" /> Buat periode
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Periode</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Rentang</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Tenggat</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {periods.loading && periods.rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">
                  <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat periode…
                </td></tr>
              )}
              {!periods.loading && periods.error && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-danger">
                  <AlertCircle size={18} className="mr-2 inline" aria-hidden="true" />{kpiError(periods.error, 'Periode gagal dimuat.')}
                </td></tr>
              )}
              {!periods.loading && !periods.error && periods.rows.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Belum ada periode. Klik Buat periode.</td></tr>
              )}
              {!periods.error && periods.rows.map((p) => {
                const st = PERIOD_STATUS[p.status];
                return (
                  <tr key={p.id} className="transition-colors hover:bg-subtle">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="num px-5 py-3 text-muted">{rangeText(p)}</td>
                    <td className="num px-5 py-3">{formatDate(p.deadline)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={st.tone} dot>{st.label}</Badge>
                      {p.status === 'selesai' && p.closed_at && (
                        <span className="ml-2 text-xs text-faint">ditutup <span className="num">{dateTimeJakarta(p.closed_at)}</span></span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {p.status !== 'selesai' && (
                          <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'deadline', period: p })}>
                            <CalendarClock size={14} aria-hidden="true" /> Ubah tenggat
                          </Button>
                        )}
                        {p.status === 'draft' && (
                          <Button
                            size="sm"
                            onClick={() => setModal({ type: 'activate', period: p })}
                            disabled={!!activateBlocker}
                            title={activateBlocker ?? undefined}
                          >
                            <Play size={14} aria-hidden="true" /> Aktifkan
                          </Button>
                        )}
                        {p.status === 'aktif' && (
                          <Button size="sm" variant="danger" onClick={() => setModal({ type: 'close', period: p })}>
                            <Square size={14} aria-hidden="true" /> Tutup periode
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modal?.type === 'create' && (
        <CreatePeriodModal
          existing={existing}
          onClose={close}
          onCreated={(row) => { close(); periods.reload(); toast(`Periode ${row.name} dibuat sebagai draft.`); }}
        />
      )}
      {modal?.type === 'deadline' && (
        <DeadlineModal
          period={modal.period}
          onClose={close}
          onSaved={(row) => { close(); periods.reload(); toast(`Tenggat ${row.name} diubah ke ${formatDate(row.deadline)}.`); }}
        />
      )}
      {modal?.type === 'activate' && (
        <ConfirmModal
          title={`Aktifkan ${modal.period.name}`}
          confirmLabel="Aktifkan"
          icon={Play}
          onClose={close}
          onConfirm={() => runStatus('hr_activate_kpi_period', modal.period, `${modal.period.name} aktif. Penilaian bisa mulai diisi.`)}
        >
          <p>
            Penilaian KPI untuk <span className="num font-medium text-fg">{rangeText(modal.period)}</span> dibuka dengan tenggat{' '}
            <span className="num font-medium text-fg">{formatDate(modal.period.deadline)}</span>.
          </p>
          <p>Karyawan bisa melihat periode ini. Hanya satu periode yang boleh aktif.</p>
        </ConfirmModal>
      )}
      {modal?.type === 'close' && (
        <ConfirmModal
          title={`Tutup ${modal.period.name}`}
          confirmLabel="Tutup periode"
          icon={Square}
          variant="danger"
          onClose={close}
          onConfirm={() => runStatus('hr_close_kpi_period', modal.period, `${modal.period.name} ditutup.`)}
        >
          <p>Status periode menjadi Selesai dan tidak bisa diaktifkan kembali.</p>
        </ConfirmModal>
      )}
    </>
  );
}
