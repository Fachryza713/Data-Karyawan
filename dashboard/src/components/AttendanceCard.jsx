import React, { useState, useEffect, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { Card, Badge, Eyebrow, Skeleton, useToast, cx } from './ui';
import ClockActions, { todayStatusText, RemoteTodayNote } from './ClockActions';
import { useTodayAttendance, timeJakarta, attendanceBadge, clockInBadge, hhmm } from '../lib/useTodayAttendance';
import { periodLabel } from '../lib/payroll';

/**
 * Kartu beranda: jam WIB, status & aksi absen hari ini, rekap presensi bulan berjalan.
 * `dash` = hasil useMyDashboard(); presensi hari ini diambil dari my_dashboard() (tanpa query terpisah).
 */
export default function AttendanceCard({ dash, setActiveMenu, className }) {
  const [now, setNow] = useState(new Date());
  const [toast, toastNode] = useToast();
  const d = dash.data;
  const loading = dash.loading && !d;
  const preset = useMemo(() => ({
    loading,
    error: dash.error,
    office: d?.office ?? null,
    shift: d?.shift ?? null,
    today: d?.attendance ?? null,
    remote: d?.remote ?? null,
    reload: dash.reload,
  }), [loading, dash.error, d, dash.reload]);
  const att = useTodayAttendance(preset);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Setelah absen tercatat, muat ulang beranda agar rekap bulan ikut diperbarui.
  const onClocked = (msg) => {
    toast(msg);
    dash.reload();
  };

  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  const { today, office, shift } = att;
  const badge = clockInBadge(today) ?? attendanceBadge(today);
  const inTime = timeJakarta(today?.clock_in_at);
  const outTime = timeJakarta(today?.clock_out_at);
  const month = d?.month;
  const stats = [
    { label: 'Hadir', value: month?.hadir },
    { label: 'Terlambat', value: month?.terlambat, tone: month?.terlambat > 0 && 'text-warning' },
    { label: 'Cuti / izin', value: month?.cuti_izin },
    { label: 'Hari kerja tersisa', value: month?.hari_kerja_tersisa },
  ];

  return (
    <Card className={cx('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5">
        <div>
          <Eyebrow>Kehadiran hari ini</Eyebrow>
          <p className="num mt-1 font-display text-3xl font-semibold tracking-tight">
            {time} <span className="text-base font-medium text-faint">WIB</span>
          </p>
          {loading ? (
            <div className="mt-2 space-y-2" aria-label="Memuat status kehadiran">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-36" />
            </div>
          ) : (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                <MapPin size={14} aria-hidden="true" />
                {office?.name ?? 'Kantor belum diatur'} · {shift ? `Shift ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : 'Shift belum diatur'}
              </p>
              <p className="mt-0.5 text-[13px] font-medium" aria-live="polite">{todayStatusText(att)}</p>
              <RemoteTodayNote remote={att.remote} className="mt-2 max-w-sm" />
            </>
          )}
        </div>
        <ClockActions att={att} onSuccess={onClocked} className="w-full sm:w-60" />
      </div>

      <dl className="mx-5 mt-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line">
        <div className="border-r border-line px-4 py-3">
          <dt className="text-xs text-faint">Masuk</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            {loading ? <Skeleton className="my-0.5 h-5 w-24" /> : (
              <>
                {inTime ? <span className="num text-base font-semibold">{inTime}</span> : <span className="text-base font-semibold text-faint">Belum tercatat</span>}
                {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
              </>
            )}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs text-faint">Pulang</dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            {loading ? <Skeleton className="my-0.5 h-5 w-24" /> : (
              <>
                {outTime ? <span className="num text-base font-semibold">{outTime}</span> : <span className="text-base font-semibold text-faint">Belum tercatat</span>}
                {outTime && (today.status === 'pulang_cepat'
                  ? <Badge tone="warning">Pulang cepat</Badge>
                  : <Badge tone="success">Sesuai jadwal</Badge>)}
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-auto px-5 pb-5 pt-5">
        <div className="mb-2 flex items-center justify-between">
          {month ? <Eyebrow>Rekap {periodLabel(month.period)}</Eyebrow> : <Skeleton className="h-4 w-32" />}
          <button
            type="button"
            onClick={() => setActiveMenu('kehadiran')}
            className="text-[13px] font-medium text-accent-text hover:underline"
          >
            Lihat log
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-faint">{s.label}</dt>
              <dd className={cx('num text-lg font-semibold', s.tone)}>
                {s.value == null ? <Skeleton className="mt-1 h-6 w-8" /> : s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {toastNode}
    </Card>
  );
}
