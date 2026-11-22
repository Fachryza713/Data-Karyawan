import React from 'react';
import { Card, Badge, Button, Eyebrow } from './ui';
import { formatRupiah } from '../lib/hr';
import { periodLabel } from '../lib/payroll';
import { SLIP_STATUS, isPublished, dateJakarta, accountText, useMyPayslipPeriods } from '../lib/payslip';

/** Kartu beranda: take home pay slip terakhir yang sudah terbit + tanggal rilis. */
export default function SalaryCard({ setActiveMenu }) {
  const { loading, error, rows, reload } = useMyPayslipPeriods();
  const latest = rows.find((r) => isPublished(r.status));
  // Periode lebih baru yang masih draft: beri tahu bahwa slip berikutnya sedang diproses.
  const processing = rows.find((r) => r.status === 'draft' && (!latest || r.period > latest.period));
  const st = latest ? SLIP_STATUS[latest.status] : null;
  const account = latest ? accountText(latest.bank_name, latest.bank_account_last4) : '';

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{latest ? `Slip gaji ${periodLabel(latest.period)}` : 'Slip gaji'}</Eyebrow>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>

      {loading && rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Memuat…</p>
      ) : error ? (
        <p className="mt-2 text-sm text-danger">
          Slip gagal dimuat.{' '}
          <button type="button" onClick={reload} className="font-medium underline underline-offset-2">Coba lagi</button>
        </p>
      ) : latest ? (
        <>
          <p className="num mt-1 font-display text-2xl font-semibold tracking-tight">{formatRupiah(latest.net)}</p>
          <p className="mt-1 text-[13px] text-muted">Take home pay · rilis {dateJakarta(latest.finalized_at)}</p>
          <p className="mt-0.5 text-[13px] text-faint">
            {latest.status === 'paid' ? `Ditransfer ${dateJakarta(latest.paid_at)} ke ${account}` : `Akan ditransfer ke ${account}`}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-lg font-semibold">Belum ada slip terbit</p>
          <p className="mt-1 text-[13px] text-muted">Slip tampil di sini setelah HR memfinalisasi payroll.</p>
        </>
      )}

      {processing && (
        <p className="mt-3 text-[13px] text-muted">
          Slip {periodLabel(processing.period)} sedang diproses HR.
        </p>
      )}

      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('gaji')}>
          Riwayat slip gaji
        </Button>
      </div>
    </Card>
  );
}
