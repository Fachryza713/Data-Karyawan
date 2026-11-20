import React from 'react';
import { Card, Badge, Button, Eyebrow } from './ui';

export default function SalaryCard({ setActiveMenu }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Slip gaji Februari 2026</Eyebrow>
        <Badge>Belum terbit</Badge>
      </div>
      <p className="mt-1 font-display text-lg font-semibold">Estimasi terbit 27 Feb</p>
      <p className="mt-1 text-[13px] text-muted">
        Slip terakhir: Januari 2026, ditransfer 25 Jan ke BCA •••• 8821.
      </p>
      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('gaji')}>
          Riwayat slip gaji
        </Button>
      </div>
    </Card>
  );
}
