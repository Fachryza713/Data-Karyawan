import React, { useState } from 'react';
import { Eye, EyeOff, Printer, FileText, CalendarClock } from 'lucide-react';
import { benefitsData, BenefitModal, BenefitList } from './BenefitsCard';
import { PageHeader, Card, CardHeader, Badge, Button, Modal, Eyebrow, cx } from './ui';

const HIDDEN = 'Rp ••••••••';
const fmt = (n) => 'Rp' + n.toLocaleString('id-ID');

const periods = [
  { id: 'feb-2026', label: 'Februari 2026', published: false, estimate: '27 Feb 2026' },
  { id: 'jan-2026', label: 'Januari 2026', published: true, ref: 'SLP/BRT/2026/01-089', transfer: '25 Jan 2026, 10:14 WIB' },
  { id: 'des-2025', label: 'Desember 2025', published: true, ref: 'SLP/BRT/2025/12-091', transfer: '25 Des 2025, 09:42 WIB' },
  { id: 'nov-2025', label: 'November 2025', published: true, ref: 'SLP/BRT/2025/11-087', transfer: '25 Nov 2025, 10:05 WIB' },
];

const pay = { basic: 12000000, allowance: 3850000, deduction: 1000000 };
const gross = pay.basic + pay.allowance;
const thp = gross - pay.deduction;

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

function PayslipModal({ period, onClose, show }) {
  return (
    <Modal
      title={`Slip gaji ${period.label}`}
      description={`No. ref ${period.ref}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
          <Button onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Cetak</Button>
        </>
      }
    >
      <div id="payslip-print" className="rounded-lg border border-line p-5">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="font-display font-semibold">Blue Rose Tech</p>
            <p className="text-xs text-faint">Slip gaji · {period.label}</p>
          </div>
          <p className="num text-right text-xs text-faint">{period.ref}</p>
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1 py-4 text-[13px]">
          <dt className="text-faint">Nama</dt><dd>Raditya Pratama</dd>
          <dt className="text-faint">NIP</dt><dd className="num">BRT-2023-0884</dd>
          <dt className="text-faint">Rekening</dt><dd>BCA •••• 8821</dd>
          <dt className="text-faint">Ditransfer</dt><dd>{period.transfer}</dd>
        </dl>
        <div className="divide-y divide-line border-t border-line">
          <Row label="Gaji pokok" value={show(pay.basic)} />
          <Row label="Tunjangan fungsional" value={show(pay.allowance)} />
          <Row label="PPh 21 & BPJS" value={show(pay.deduction, '−')} negative />
          <Row label="Take home pay" value={show(thp)} strong />
        </div>
      </div>
    </Modal>
  );
}

export default function SalaryPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('jan-2026');
  const [hideSalary, setHideSalary] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState(null);

  const period = periods.find((p) => p.id === selectedPeriod);
  const show = (n, prefix = '') => (hideSalary ? `${prefix}${HIDDEN}` : `${prefix}${fmt(n)}`);

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
          <ul className="p-2" role="listbox" aria-label="Periode slip gaji">
            {periods.map((p) => {
              const active = p.id === selectedPeriod;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedPeriod(p.id)}
                    className={cx(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-accent-soft' : 'hover:bg-subtle',
                    )}
                  >
                    <div>
                      <p className={cx('text-sm', active ? 'font-medium text-accent-text' : 'text-fg')}>{p.label}</p>
                      <p className="num text-xs text-faint">{p.published ? show(thp) : `Estimasi ${p.estimate}`}</p>
                    </div>
                    {p.published ? <Badge tone="success">Dibayar</Badge> : <Badge>Belum terbit</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Detail slip */}
        {!period.published ? (
          <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <CalendarClock size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
            <h2 className="mt-3 text-base font-semibold">Slip {period.label} belum terbit</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Penggajian diproses di hari kerja terakhir. Estimasi transfer {period.estimate}.
            </p>
          </Card>
        ) : (
          <Card>
            <CardHeader
              title={`Slip gaji ${period.label}`}
              description={<span className="num">{period.ref}</span>}
              action={<Badge tone="success" dot>Dibayar</Badge>}
            />
            <div className="p-5">
              <div className="flex flex-col gap-4 rounded-lg bg-subtle p-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Eyebrow>Take home pay</Eyebrow>
                  <p className="num mt-1 font-display text-3xl font-semibold tracking-tight">{show(thp)}</p>
                </div>
                <p className="text-[13px] text-muted sm:text-right">
                  BCA •••• 8821<br />
                  <span className="text-faint">Ditransfer {period.transfer}</span>
                </p>
              </div>

              <div className="mt-5 grid gap-x-8 md:grid-cols-2">
                <div>
                  <h3 className="border-b border-line pb-2 text-xs font-medium text-faint">Penerimaan</h3>
                  <div className="divide-y divide-line">
                    <Row label="Gaji pokok" value={show(pay.basic)} />
                    <Row label="Tunjangan fungsional" note="Keahlian rekayasa frontend" value={show(pay.allowance)} />
                    <Row label="Total bruto" value={show(gross)} strong />
                  </div>
                </div>
                <div className="mt-5 md:mt-0">
                  <h3 className="border-b border-line pb-2 text-xs font-medium text-faint">Potongan</h3>
                  <div className="divide-y divide-line">
                    <Row label="PPh 21 & BPJS" note="JHT, JP, BPJS Kesehatan" value={show(pay.deduction, '−')} negative />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button variant="secondary" onClick={() => setShowPdf(true)}>
                  <FileText size={16} aria-hidden="true" /> Lihat & cetak slip
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <Card className="mt-5">
        <CardHeader title="Manfaat & asuransi" description={`${benefitsData.length} program aktif`} />
        <BenefitList onSelect={setSelectedBenefit} />
      </Card>

      {showPdf && period.published && <PayslipModal period={period} onClose={() => setShowPdf(false)} show={show} />}
      {selectedBenefit && <BenefitModal benefit={selectedBenefit} onClose={() => setSelectedBenefit(null)} />}
    </>
  );
}
