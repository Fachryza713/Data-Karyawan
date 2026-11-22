import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Printer, CalendarClock, Loader2, FileX } from 'lucide-react';
import { useMyBenefits, BenefitModal, BenefitList } from './BenefitsCard';
import { PageHeader, Card, CardHeader, Badge, Button, Eyebrow, cx } from './ui';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from '../lib/hr';
import { periodLabel } from '../lib/payroll';
import { dateTimeJakarta } from '../lib/leave';
import {
  SLIP_STATUS, isPublished, dateJakarta, accountText, useMyPayslipPeriods, useMyPayslip,
} from '../lib/payslip';

const HIDDEN = 'Rp ••••••••';

/** Baris penerimaan & potongan satu slip (dipakai tampilan layar dan cetak). */
function slipLines(slip) {
  const earnings = [
    { label: 'Gaji pokok', value: slip.base_salary },
    { label: 'Tunjangan tetap', value: slip.allowance },
    { label: 'Bonus', value: slip.bonus },
  ];
  const deductions = [
    { label: 'BPJS Kesehatan', note: 'Bagian karyawan', value: slip.bpjs_kes },
    { label: 'JHT', note: 'BPJS Ketenagakerjaan · Jaminan Hari Tua', value: slip.bpjs_jht },
    { label: 'JP', note: 'BPJS Ketenagakerjaan · Jaminan Pensiun', value: slip.bpjs_jp },
    { label: 'PPh 21', value: slip.pph21 },
    { label: 'Lain-lain', value: slip.other_deductions },
  ];
  const totalDeduction = deductions.reduce((n, d) => n + Number(d.value ?? 0), 0);
  return { earnings, deductions, totalDeduction };
}

const transferText = (run) => (run.status === 'paid' ? `Ditransfer ${dateTimeJakarta(run.paid_at)} WIB` : 'Terbit, menunggu transfer');

function Row({ label, note, value, strong, negative }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 py-2.5', strong && 'font-semibold')}>
      <div>
        <p className="text-sm">{label}</p>
        {note && <p className="text-xs text-faint">{note}</p>}
      </div>
      <p className={cx('num whitespace-nowrap text-sm', negative && 'text-danger')}>{value}</p>
    </div>
  );
}

/**
 * Slip khusus cetak. Dirender ke <body> lewat portal dan hanya tampil di @media print
 * (lihat index.css). Warna netral tetap (bukan token tema) agar dark mode tidak ikut tercetak.
 */
function PrintableSlip({ slip, profile }) {
  const { earnings, deductions, totalDeduction } = slipLines(slip);
  const period = periodLabel(slip.run.period);
  const identity = [
    ['Nama', profile.full_name],
    ['Periode', period],
    ['NIP', profile.nip ?? '—'],
    ['Rekening', accountText(slip.bank_name, slip.bank_account_last4)],
    ['Divisi', profile.division?.name ?? '—'],
    ['Status', transferText(slip.run)],
    ['Jabatan', profile.position?.name ?? '—'],
    ['Terbit', dateJakarta(slip.run.finalized_at)],
  ];

  const table = (title, rows, totalLabel, total, minus) => (
    <table className="w-full border-collapse">
      <thead>
        <tr><th colSpan={2} className="border-b border-black pb-1 text-left text-[11px] font-bold uppercase tracking-wide">{title}</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-gray-300">
            <td className="py-1.5 pr-2">{r.label}</td>
            <td className="py-1.5 text-right tabular-nums">{minus && Number(r.value) > 0 ? '−' : ''}{formatRupiah(r.value)}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td className="pt-2">{totalLabel}</td>
          <td className="pt-2 text-right tabular-nums">{minus && total > 0 ? '−' : ''}{formatRupiah(total)}</td>
        </tr>
      </tbody>
    </table>
  );

  return createPortal(
    <div id="payslip-print" aria-hidden="true" className="bg-white text-[12px] leading-relaxed text-black">
      <header className="flex items-center justify-between gap-6 border-b-2 border-black pb-3">
        <div className="flex items-center gap-3">
          <img src="/assets/logo.jpg" alt="" className="h-12 w-12 rounded object-cover" />
          <div>
            <p className="text-lg font-bold">Blue Rose Tech</p>
            <p className="text-gray-600">Human Resources</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-bold uppercase tracking-wide">Slip gaji</p>
          <p>Periode {period}</p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-[80px_1fr_80px_1fr] gap-x-4 gap-y-1">
        {identity.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-gray-600">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </React.Fragment>
        ))}
      </dl>

      <div className="mt-6 grid grid-cols-2 gap-8">
        {table('Penerimaan', earnings, 'Total bruto', Number(slip.gross), false)}
        {table('Potongan', deductions, 'Total potongan', totalDeduction, true)}
      </div>

      <div className="mt-6 flex items-center justify-between border-y-2 border-black py-3 text-base font-bold">
        <span>Take home pay</span>
        <span className="tabular-nums">{formatRupiah(slip.net)}</span>
      </div>

      <p className="mt-8 text-[10px] text-gray-600">
        Dicetak dari HRIS Blue Rose Tech pada {dateTimeJakarta(new Date())} WIB. Dokumen rahasia, hanya untuk karyawan yang bersangkutan.
      </p>
    </div>,
    document.body,
  );
}

function SlipDetail({ slip, show }) {
  const { earnings, deductions, totalDeduction } = slipLines(slip);
  const st = SLIP_STATUS[slip.run.status];
  return (
    <Card>
      <CardHeader
        title={`Slip gaji ${periodLabel(slip.run.period)}`}
        description={`Terbit ${dateJakarta(slip.run.finalized_at)}`}
        action={<Badge tone={st.tone} dot>{st.label}</Badge>}
      />
      <div className="p-5">
        <div className="flex flex-col gap-4 rounded-lg bg-subtle p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Take home pay</Eyebrow>
            <p className="num mt-1 font-display text-3xl font-semibold tracking-tight">{show(slip.net)}</p>
          </div>
          <p className="text-[13px] text-muted sm:text-right">
            {accountText(slip.bank_name, slip.bank_account_last4)}<br />
            <span className="text-faint">{transferText(slip.run)}</span>
          </p>
        </div>

        <div className="mt-5 grid gap-x-8 md:grid-cols-2">
          <div>
            <h3 className="border-b border-line pb-2 text-xs font-medium text-faint">Penerimaan</h3>
            <div className="divide-y divide-line">
              {earnings.map((r) => <Row key={r.label} label={r.label} note={r.note} value={show(r.value)} />)}
              <Row label="Total bruto" value={show(slip.gross)} strong />
            </div>
          </div>
          <div className="mt-5 md:mt-0">
            <h3 className="border-b border-line pb-2 text-xs font-medium text-faint">Potongan</h3>
            <div className="divide-y divide-line">
              {deductions.map((r) => (
                <Row key={r.label} label={r.label} note={r.note} value={show(r.value, Number(r.value) > 0 ? '−' : '')} negative={Number(r.value) > 0} />
              ))}
              <Row label="Total potongan" value={show(totalDeduction, totalDeduction > 0 ? '−' : '')} strong negative={totalDeduction > 0} />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <span className="text-sm font-semibold">Take home pay</span>
          <span className="num text-sm font-semibold">{show(slip.net)}</span>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Cetak slip
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmptyPanel({ icon: Icon, title, children, action }) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action}
    </Card>
  );
}

export default function SalaryPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const periods = useMyPayslipPeriods();
  const benefits = useMyBenefits();
  const [hideSalary, setHideSalary] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);

  // Periode dipilih lewat ?periode=YYYY-MM; default slip terbit terbaru.
  const requested = params.get('periode');
  const fallback = periods.rows.find((r) => isPublished(r.status)) ?? periods.rows[0];
  const selectedPeriod = requested ?? fallback?.period ?? null;
  const current = periods.rows.find((r) => r.period === selectedPeriod) ?? null;
  const detail = useMyPayslip(current?.payslip_id ?? null);
  // Saat pindah periode, slip sebelumnya masih ada satu render sebelum efek memuat yang baru.
  const stale = !!detail.slip && detail.slip.id !== current?.payslip_id;
  const slip = stale ? null : detail.slip;

  const select = (period) => setParams({ periode: period }, { replace: true });
  const show = (n, prefix = '') => (hideSalary ? `${prefix}${HIDDEN}` : `${prefix}${formatRupiah(n)}`);

  let panel;
  if (periods.loading && periods.rows.length === 0) {
    panel = (
      <Card className="px-6 py-14 text-center text-sm text-muted">
        <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat slip gaji…
      </Card>
    );
  } else if (periods.error) {
    panel = (
      <EmptyPanel icon={FileX} title="Slip gaji gagal dimuat" action={<Button variant="secondary" className="mt-4" onClick={periods.reload}>Coba lagi</Button>} />
    );
  } else if (periods.rows.length === 0) {
    panel = (
      <EmptyPanel icon={CalendarClock} title="Belum ada slip gaji">
        Slip muncul di sini setelah HR memproses payroll.
      </EmptyPanel>
    );
  } else if (!current) {
    panel = (
      <EmptyPanel
        icon={FileX}
        title="Slip tidak tersedia"
        action={<Button variant="secondary" className="mt-4" onClick={() => setParams({}, { replace: true })}>Lihat slip terbaru</Button>}
      >
        Tidak ada slip gaji Anda untuk periode {/^\d{4}-\d{2}$/.test(requested ?? '') ? periodLabel(requested) : 'tersebut'}.
      </EmptyPanel>
    );
  } else if (!isPublished(current.status)) {
    panel = (
      <EmptyPanel icon={CalendarClock} title={`Slip ${periodLabel(current.period)} belum terbit`}>
        HR sedang memproses payroll periode ini. Slip dan nominal tampil setelah difinalisasi.
      </EmptyPanel>
    );
  } else if (detail.loading || stale) {
    panel = (
      <Card className="px-6 py-14 text-center text-sm text-muted">
        <Loader2 size={18} className="mr-2 inline animate-spin" aria-hidden="true" />Memuat slip…
      </Card>
    );
  } else if (!slip) {
    panel = (
      <EmptyPanel icon={FileX} title="Slip tidak tersedia">
        {detail.error ? 'Slip gagal dimuat. Muat ulang halaman.' : 'Slip ini tidak bisa dibuka.'}
      </EmptyPanel>
    );
  } else {
    panel = <SlipDetail slip={slip} show={show} />;
  }

  return (
    <>
      <PageHeader
        title="Gaji & manfaat"
        description="Slip gaji bulanan dan program perlindungan Anda."
        actions={
          <Button variant="secondary" onClick={() => setHideSalary((v) => !v)} aria-pressed={hideSalary}>
            {hideSalary ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            {hideSalary ? 'Tampilkan nominal' : 'Sembunyikan nominal'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        {/* Daftar periode */}
        <Card className="self-start">
          <CardHeader title="Periode" />
          {periods.rows.length === 0 ? (
            <p className="px-5 py-6 text-center text-[13px] text-muted">{periods.loading ? 'Memuat…' : 'Belum ada periode.'}</p>
          ) : (
            <ul className="p-2" role="listbox" aria-label="Periode slip gaji">
              {periods.rows.map((p) => {
                const active = p.period === selectedPeriod;
                const st = SLIP_STATUS[p.status];
                return (
                  <li key={p.period}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(p.period)}
                      className={cx(
                        'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-accent-soft' : 'hover:bg-subtle',
                      )}
                    >
                      <div className="min-w-0">
                        <p className={cx('text-sm', active ? 'font-medium text-accent-text' : 'text-fg')}>{periodLabel(p.period)}</p>
                        <p className="num truncate text-xs text-faint">{isPublished(p.status) ? show(p.net) : 'Sedang diproses HR'}</p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {panel}
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Manfaat & asuransi"
          description={benefits.loading ? 'Memuat…' : `${benefits.activeCount} program aktif`}
        />
        <BenefitList benefits={benefits} onSelect={setSelectedBenefit} />
      </Card>

      {slip && current && isPublished(current.status) && <PrintableSlip slip={slip} profile={profile} />}
      {selectedBenefit && <BenefitModal benefit={selectedBenefit} onClose={() => setSelectedBenefit(null)} />}
    </>
  );
}
