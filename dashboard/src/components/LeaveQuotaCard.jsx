import React from 'react';
import { Card, Button, Eyebrow } from './ui';
import { useLeaveBalance, currentYear } from '../lib/leave';

export default function LeaveQuotaCard({ setActiveMenu }) {
  const year = currentYear();
  const { loading, error, balance, reload } = useLeaveBalance(year);
  const total = balance?.quota ?? 0;
  const used = balance?.used ?? 0;
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <Card className="flex flex-col p-5">
      <Eyebrow>Sisa cuti tahunan {year}</Eyebrow>
      {loading ? (
        <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-faint">—</p>
      ) : error ? (
        <p className="mt-2 text-sm text-danger">
          Kuota gagal dimuat.{' '}
          <button type="button" onClick={reload} className="font-medium underline underline-offset-2">Muat ulang</button>
        </p>
      ) : !balance ? (
        <p className="mt-2 text-sm text-muted">Kuota cuti tahun ini belum tersedia. Hubungi HR.</p>
      ) : (
        <>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
            <span className="num">{balance.remaining}</span>
            <span className="text-base font-medium text-faint"> / {total} hari</span>
          </p>

          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Cuti terpakai"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            <span className="num">{used}</span> hari terpakai · berlaku s.d. 31 Des {year}
          </p>
          {balance.pending > 0 && (
            <p className="mt-0.5 text-[13px] text-warning">
              <span className="num">{balance.pending}</span> hari menunggu persetujuan
            </p>
          )}
        </>
      )}

      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('kehadiran')}>
          Ajukan cuti
        </Button>
      </div>
    </Card>
  );
}
