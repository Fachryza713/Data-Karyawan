import React from 'react';
import { Card, Button, Eyebrow, Skeleton } from './ui';
import { currentYear } from '../lib/leave';

/**
 * Kartu beranda: sisa cuti tahunan + pengajuan yang menunggu persetujuan.
 * `leave` = my_dashboard().leave ({ year, quota, used, pending_days, remaining, available }) atau null.
 */
export default function LeaveQuotaCard({ leave, pendingRequests = 0, loading, setActiveMenu }) {
  const year = leave?.year ?? currentYear();
  const total = leave?.quota ?? 0;
  const used = leave?.used ?? 0;
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <Card className="flex flex-col p-5">
      <Eyebrow>Sisa cuti tahunan {year}</Eyebrow>
      {loading ? (
        <div aria-label="Memuat sisa cuti">
          <Skeleton className="mt-2 h-8 w-32" />
          <Skeleton className="mt-4 h-2 w-full" />
          <Skeleton className="mt-3 h-4 w-48" />
        </div>
      ) : !leave ? (
        <p className="mt-2 text-sm text-muted">Kuota cuti tahun ini belum tersedia. Hubungi HR.</p>
      ) : (
        <>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
            <span className="num">{leave.remaining}</span>
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
          {leave.pending_days > 0 && (
            <p className="mt-0.5 text-[13px] text-warning">
              <span className="num">{leave.pending_days}</span> hari cuti tahunan menunggu persetujuan
            </p>
          )}
        </>
      )}

      {!loading && pendingRequests > 0 && (
        <button
          type="button"
          onClick={() => setActiveMenu('kehadiran')}
          className="mt-3 self-start text-left text-[13px] font-medium text-accent-text hover:underline"
        >
          <span className="num">{pendingRequests}</span> pengajuan menunggu persetujuan HR
        </button>
      )}

      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('kehadiran')}>
          Ajukan cuti
        </Button>
      </div>
    </Card>
  );
}
