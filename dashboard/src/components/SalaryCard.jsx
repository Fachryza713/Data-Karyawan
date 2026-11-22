import React from 'react';
import { Card, Badge, Button, Eyebrow, Skeleton } from './ui';
import { formatRupiah } from '../lib/hr';
import { periodLabel } from '../lib/payroll';
import { SLIP_STATUS, dateJakarta, accountText } from '../lib/payslip';

/**
 * Kartu beranda: take home pay slip terakhir yang sudah terbit + tanggal rilis.
 * `payslip` = my_dashboard().payslip (slip final/paid terbaru) atau null;
 * `processing` = periode lebih baru yang masih diproses HR ("YYYY-MM") atau null.
 */
export default function SalaryCard({ payslip, processing, loading, setActiveMenu }) {
  const st = payslip ? SLIP_STATUS[payslip.status] : null;
  const account = payslip ? accountText(payslip.bank_name, payslip.bank_account_last4) : '';

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{payslip ? `Slip gaji ${periodLabel(payslip.period)}` : 'Slip gaji'}</Eyebrow>
        {st && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>

      {loading ? (
        <div aria-label="Memuat slip gaji">
          <Skeleton className="mt-2 h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-48" />
          <Skeleton className="mt-1.5 h-4 w-36" />
        </div>
      ) : payslip ? (
        <>
          <p className="num mt-1 font-display text-2xl font-semibold tracking-tight">{formatRupiah(payslip.net)}</p>
          <p className="mt-1 text-[13px] text-muted">Take home pay · rilis {dateJakarta(payslip.finalized_at)}</p>
          <p className="mt-0.5 text-[13px] text-faint">
            {payslip.status === 'paid' ? `Ditransfer ${dateJakarta(payslip.paid_at)} ke ${account}` : `Akan ditransfer ke ${account}`}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-lg font-semibold">Belum ada slip gaji</p>
          <p className="mt-1 text-[13px] text-muted">Slip tampil di sini setelah HR memfinalisasi payroll.</p>
        </>
      )}

      {!loading && processing && (
        <p className="mt-3 text-[13px] text-muted">
          Slip {periodLabel(processing)} sedang diproses HR.
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
