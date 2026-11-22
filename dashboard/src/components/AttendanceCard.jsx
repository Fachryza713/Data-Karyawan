import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { Card, Badge, Eyebrow, useToast, cx } from './ui';
import ClockActions, { todayStatusText, RemoteTodayNote } from './ClockActions';
import { useTodayAttendance, timeJakarta, attendanceBadge, clockInBadge, hhmm } from '../lib/useTodayAttendance';

const MONTH_STATS = [
  { label: 'Hadir', value: 19 },
  { label: 'Terlambat', value: 1, tone: 'text-warning' },
  { label: 'Cuti', value: 1 },
  { label: 'Hari kerja tersisa', value: 3 },
];

export default function AttendanceCard({ setActiveMenu, className }) {
  const [now, setNow] = useState(new Date());
  const att = useTodayAttendance();
  const [toast, toastNode] = useToast();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  const { today, office, shift, loading } = att;
  const badge = clockInBadge(today) ?? attendanceBadge(today);
  const inTime = timeJakarta(today?.clock_in_at);
  const outTime = timeJakarta(today?.clock_out_at);

  return (
    <Card className={cx('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div>
          <Eyebrow>Kehadiran hari ini</Eyebrow>
          <p className="num mt-1 font-display text-3xl font-semibold tracking-tight">
            {time} <span className="text-base font-medium text-faint">WIB</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
            <MapPin size={14} aria-hidden="true" />
            {loading ? 'Memuat…' : (
              <>
                {office?.name ?? 'Kantor belum diatur'} · {shift ? `Shift ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : 'Shift belum diatur'}
              </>
            )}
          </p>
          {!loading && <p className="mt-0.5 text-[13px] font-medium" aria-live="polite">{todayStatusText(att)}</p>}
          {!loading && <RemoteTodayNote remote={att.remote} className="mt-2 max-w-sm" />}
        </div>
        <ClockActions att={att} onSuccess={toast} className="w-full sm:w-60" />
      </div>

      <dl className="mx-5 mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line">
        <div className="border-r border-line px-4 py-3">
          <dt className="text-xs text-faint">Masuk</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            {inTime ? <span className="num text-base font-semibold">{inTime}</span> : <span className="text-base font-semibold text-faint">Belum tercatat</span>}
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-faint">Pulang</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            {outTime ? <span className="num text-base font-semibold">{outTime}</span> : <span className="text-base font-semibold text-faint">Belum tercatat</span>}
            {outTime && (today.status === 'pulang_cepat'
              ? <Badge tone="warning">Pulang cepat</Badge>
              : <Badge tone="success">Sesuai jadwal</Badge>)}
          </dd>
        </div>
      </dl>

      <div className="mt-auto px-5 pb-5 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Februari 2026</Eyebrow>
          <button
            type="button"
            onClick={() => setActiveMenu('kehadiran')}
            className="text-[13px] font-medium text-accent-text hover:underline"
          >
            Lihat log
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {MONTH_STATS.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-faint">{s.label}</dt>
              <dd className={cx('num text-lg font-semibold', s.tone)}>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {toastNode}
    </Card>
  );
}
