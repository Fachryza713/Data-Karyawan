import React from 'react';
import { Card, Badge, Button, Eyebrow, Skeleton } from './ui';
import { formatDate } from '../lib/hr';
import { dateJakarta } from '../lib/payslip';
import { GRADE_TONE, formatScore } from '../lib/kpi';

/**
 * Kartu beranda: hasil KPI final terakhir.
 * `kpi` = my_dashboard().kpi ({ period_name, final_score, grade, finalized_at }) atau null;
 * `activePeriod` = my_dashboard().kpi_active_period ({ name, deadline, finalized }) atau null.
 */
export default function KpiSummaryCard({ kpi, activePeriod, loading, setActiveMenu }) {
  const ongoing = activePeriod && !activePeriod.finalized;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{kpi ? `Kinerja ${kpi.period_name}` : 'Kinerja (KPI)'}</Eyebrow>
        {kpi && <Badge tone={GRADE_TONE[kpi.grade]} className="num">Grade {kpi.grade}</Badge>}
      </div>

      {loading ? (
        <div aria-label="Memuat hasil KPI">
          <Skeleton className="mt-2 h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-44" />
        </div>
      ) : kpi ? (
        <>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
            <span className="num">{formatScore(kpi.final_score)}</span>
            <span className="text-base font-medium text-faint"> / 100</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">Skor akhir · difinalkan {dateJakarta(kpi.finalized_at)}</p>
        </>
      ) : (
        <>
          <p className="mt-1 font-display text-lg font-semibold">Belum ada hasil KPI</p>
          <p className="mt-1 text-[13px] text-muted">Hasil tampil setelah HR memfinalkan penilaian kuartal Anda.</p>
        </>
      )}

      {!loading && ongoing && (
        <p className="mt-3 text-[13px] text-muted">
          Penilaian {activePeriod.name} sedang berlangsung · tenggat {formatDate(activePeriod.deadline)}.
        </p>
      )}

      <div className="mt-auto pt-5">
        <Button variant="secondary" className="w-full" onClick={() => setActiveMenu('kinerja')}>
          Lihat kinerja
        </Button>
      </div>
    </Card>
  );
}
