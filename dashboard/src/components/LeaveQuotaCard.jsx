import React from 'react';
import { Card, Button, Eyebrow } from './ui';

export default function LeaveQuotaCard({ setActiveMenu }) {
  const total = 12;
  const used = 4;
  const remaining = total - used;
  const pct = Math.round((used / total) * 100);

  return (
    <Card className="flex flex-col p-5">
      <Eyebrow>Sisa cuti tahunan 2026</Eyebrow>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
        <span className="num">{remaining}</span>
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
        <span className="num">{used}</span> hari terpakai · berlaku s.d. 31 Des 2026
      </p>

      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('kehadiran')}>
          Ajukan cuti
        </Button>
      </div>
    </Card>
  );
}
