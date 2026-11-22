import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { PageHeader, Card, Badge, Button, IconButton, Modal, Field, inputCls, cx } from '../ui';
import { supabase } from '../../lib/supabase';
import { formatRupiah } from '../../lib/hr';
import {
  RUN_STATUS, periodLabel, currentPeriod, payrollError, usePayrollRuns,
} from '../../lib/payroll';

/** "2026-11" + n bulan. */
function shiftPeriod(period, n) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Pilihan periode: bulan depan sampai 12 bulan ke belakang. */
function periodOptions() {
  const next = shiftPeriod(currentPeriod(), 1);
  return Array.from({ length: 14 }, (_, i) => shiftPeriod(next, -i));
}

function CreateRunModal({ existing, onClose, onCreated }) {
  const options = useMemo(periodOptions, []);
  const [period, setPeriod] = useState(() => {
    const cur = currentPeriod();
    return existing.has(cur) ? options.find((p) => !existing.has(p)) ?? cur : cur;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    if (existing.has(period)) {
      setError(`Payroll ${periodLabel(period)} sudah dibuat.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('create_payroll_run', { p_period: period });
    setBusy(false);
    if (err) {
      setError(payrollError(err, 'Payroll gagal dibuat. Coba lagi.'));
      return;
    }
    onCreated(period, data);
  };

  return (
    <Modal
      size="sm"
      title="Buat payroll"
      description="Draft slip dibuat untuk semua karyawan aktif dari data gaji yang berlaku."
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" form="create-run-form" disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            {busy ? 'Menghitung…' : 'Buat draft'}
          </Button>
        </>
      }
    >
      <form id="create-run-form" onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Field label="Periode" required htmlFor="run-period" hint="Gaji pokok, tunjangan, dan potongan BPJS dihitung otomatis. Bonus dan PPh 21 diisi setelah draft dibuat.">
          <select
            id="run-period" value={period}
            onChange={(e) => { setPeriod(e.target.value); setError(null); }}
            className={cx(inputCls, 'pr-8')}
          >
            {options.map((p) => (
              <option key={p} value={p} disabled={existing.has(p)}>
                {periodLabel(p)}{existing.has(p) ? ' (sudah ada)' : ''}
              </option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export default function PayrollRunsPage() {
  const navigate = useNavigate();
  const runs = usePayrollRuns();
  const [showCreate, setShowCreate] = useState(false);
  const existing = useMemo(() => new Set(runs.rows.map((r) => r.period)), [runs.rows]);
  const open = (period) => navigate(`/hr/penggajian/${period}`);

  return (
    <>
      <PageHeader
        title="Penggajian & manfaat"
        description="Payroll bulanan: draft, finalisasi, dan pembayaran."
        actions={
          <Button onClick={() => setShowCreate(true)} disabled={runs.loading}>
            <Plus size={16} aria-hidden="true" /> Buat payroll
          </Button>
        }
      />

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Riwayat payroll</h2>
            <p className="mt-0.5 text-[13px] text-muted">Satu payroll per periode. Klik baris untuk melihat slip.</p>
          </div>
          <IconButton label="Muat ulang" className="h-8 w-8" onClick={runs.reload} disabled={runs.loading}>
            <RefreshCw size={15} className={cx(runs.loading && 'animate-spin')} />
          </IconButton>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Periode</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Karyawan</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Bruto</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">BPJS + PPh 21</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Take home pay</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">BPJS perusahaan</th>
                <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Buka</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.loading && runs.rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-muted">
                  <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat payroll…
                </td></tr>
              )}
              {!runs.loading && runs.error && (
                <tr><td colSpan={8} className="px-5 py-10 text-center text-danger">
                  <AlertCircle size={18} className="mr-2 inline" aria-hidden="true" />
                  {payrollError(runs.error, 'Payroll gagal dimuat. Coba muat ulang.')}
                </td></tr>
              )}
              {!runs.loading && !runs.error && runs.rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-muted">
                  Belum ada payroll. Klik <span className="font-medium text-fg">Buat payroll</span> untuk memulai.
                </td></tr>
              )}
              {!runs.error && runs.rows.map((r) => {
                const st = RUN_STATUS[r.status];
                return (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => open(r.period)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.period); } }}
                    aria-label={`Buka payroll ${periodLabel(r.period)}`}
                    className="cursor-pointer transition-colors hover:bg-subtle"
                  >
                    <td className="px-5 py-3 font-medium">{periodLabel(r.period)}</td>
                    <td className="px-5 py-3"><Badge tone={st.tone} dot>{st.label}</Badge></td>
                    <td className="num px-5 py-3 text-right">{r.employee_count}</td>
                    <td className="num px-5 py-3 text-right">{formatRupiah(r.total_gross)}</td>
                    <td className="num px-5 py-3 text-right text-muted">
                      {formatRupiah(Number(r.total_bpjs_employee) + Number(r.total_pph21))}
                    </td>
                    <td className="num px-5 py-3 text-right font-semibold">{formatRupiah(r.total_net)}</td>
                    <td className="num px-5 py-3 text-right text-muted">{formatRupiah(r.total_employer)}</td>
                    <td className="px-3 py-3 text-faint"><ChevronRight size={16} aria-hidden="true" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <CreateRunModal
          existing={existing}
          onClose={() => setShowCreate(false)}
          onCreated={(period, result) => {
            setShowCreate(false);
            navigate(`/hr/penggajian/${period}`, { state: { created: result } });
          }}
        />
      )}
    </>
  );
}
