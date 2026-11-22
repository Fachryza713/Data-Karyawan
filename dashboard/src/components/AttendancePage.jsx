import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapPin, Plus, Briefcase } from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, Pagination, useToast, inputCls, cx,
} from './ui';
import ClockActions, { todayStatusText, RemoteTodayNote } from './ClockActions';
import LeaveRequestModal from './LeaveRequestModal';
import MyRequestsCard from './MyRequestsCard';
import { useLeaveTypes, useLeaveBalance, useMyRequests } from '../lib/leave';
import {
  useTodayAttendance, timeJakarta, longDateJakarta, clockInBadge, attendanceBadge, hhmm,
} from '../lib/useTodayAttendance';
import { isoJakarta, addDays, weekdayName, isWeekendIso, MODE_LABEL } from '../lib/attendance';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const PER_PAGE = 8;

function fmtDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** 12 bulan terakhir (WIB), terbaru dulu. */
function monthOptions(count = 12) {
  const [y, m] = isoJakarta().split('-').map(Number);
  const fmt = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return { value: d.toISOString().slice(0, 7), label: fmt.format(d) };
  });
}

function lastDayOfMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Riwayat satu bulan: baris attendances + hari libur, untuk karyawan login. */
function useMonthHistory(month) {
  const { profile } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [], holidays: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const first = `${month}-01`;
    const last = lastDayOfMonth(month);
    const [att, hol] = await Promise.all([
      supabase.from('attendances')
        .select('id, date, clock_in_at, clock_out_at, status, late_minutes, mode')
        .eq('employee_id', profile.id).gte('date', first).lte('date', last),
      supabase.from('holidays').select('date, name').gte('date', first).lte('date', last),
    ]);
    setState({ loading: false, error: att.error || hol.error, rows: att.data ?? [], holidays: hol.data ?? [] });
  }, [month, profile.id]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Badge status untuk satu hari di riwayat. */
function HistoryStatus({ day }) {
  if (day.kind === 'libur') return <Badge>{day.holiday ?? 'Libur'}</Badge>;
  if (day.kind === 'belum') return <Badge>Belum absen</Badge>;
  if (day.kind === 'kosong') return <span className="text-faint">Tidak tercatat</span>;
  const inB = clockInBadge(day.row) ?? attendanceBadge(day.row);
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {inB && <Badge tone={inB.tone} dot={!!day.row.clock_in_at}>{inB.label}</Badge>}
      {day.row.status === 'pulang_cepat' && <Badge tone="warning">Pulang cepat</Badge>}
    </span>
  );
}

export default function AttendancePage() {
  const [now, setNow] = useState(new Date());
  const att = useTodayAttendance();
  const { profile } = useAuth();
  const months = useMemo(() => monthOptions(), []);
  const [month, setMonth] = useState(months[0].value);
  const history = useMonthHistory(month);
  const [page, setPage] = useState(1);
  const [modalTab, setModalTab] = useState(null); // null | 'leave' | 'remote'
  const [toast, toastNode] = useToast();
  const leaveTypes = useLeaveTypes();
  const leaveBalance = useLeaveBalance();
  const myRequests = useMyRequests();
  const refreshRequests = (msg) => {
    myRequests.reload();
    leaveBalance.reload();
    if (msg) toast(msg);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { today, office, shift, loading } = att;
  const inTime = timeJakarta(today?.clock_in_at);
  const outTime = timeJakarta(today?.clock_out_at);
  const inBadge = clockInBadge(today);

  const handleSubmitLeave = () => {
    setModalTab(null);
    refreshRequests('Pengajuan terkirim. Status bisa dipantau di daftar Pengajuan saya.');
  };

  // Hari-hari bulan terpilih sampai hari ini (terbaru dulu), digabung dengan data DB.
  const todayIso = isoJakarta(now);
  const days = useMemo(() => {
    const byDate = new Map(history.rows.map((r) => [r.date, r]));
    if (today && today.date.startsWith(month)) byDate.set(today.date, today);
    const holidays = new Map(history.holidays.map((h) => [h.date, h.name]));
    const last = lastDayOfMonth(month) < todayIso ? lastDayOfMonth(month) : todayIso;
    const list = [];
    for (let d = last; d >= `${month}-01`; d = addDays(d, -1)) {
      if (profile.join_date && d < profile.join_date) break;
      const row = byDate.get(d);
      const holiday = holidays.get(d);
      let kind = 'data';
      if (!row) kind = holiday || isWeekendIso(d) ? 'libur' : d === todayIso ? 'belum' : 'kosong';
      list.push({ date: d, row, holiday, kind, isToday: d === todayIso });
    }
    return list;
  }, [history.rows, history.holidays, today, month, todayIso, profile.join_date]);

  const stats = useMemo(() => {
    const rows = days.map((d) => d.row).filter(Boolean);
    return [
      { label: 'Hadir', value: rows.filter((r) => r.clock_in_at).length },
      { label: 'Terlambat', value: rows.filter((r) => r.late_minutes > 0).length, tone: 'text-warning' },
      { label: 'Cuti / izin', value: rows.filter((r) => ['cuti', 'sakit', 'izin'].includes(r.status)).length },
      { label: 'Alpa', value: rows.filter((r) => r.status === 'alpa').length, tone: 'text-danger' },
    ];
  }, [days]);

  const totalPages = Math.max(1, Math.ceil(days.length / PER_PAGE));
  const displayed = days.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const from = days.length ? (page - 1) * PER_PAGE + 1 : 0;
  const to = Math.min(page * PER_PAGE, days.length);
  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <>
      <PageHeader
        title="Kehadiran & cuti"
        description="Presensi harian dan riwayat kehadiran Anda."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModalTab('remote')}>
              <Briefcase size={16} aria-hidden="true" /> Ajukan WFH / dinas luar
            </Button>
            <Button onClick={() => setModalTab('leave')} disabled={leaveTypes.length === 0}>
              <Plus size={16} aria-hidden="true" /> Ajukan cuti / izin
            </Button>
          </>
        }
      />

      {/* Presensi harian */}
      <Card className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center sm:p-6">
        <div>
          <p className="text-xs font-medium text-faint">
            {longDateJakarta(now)}
            {shift && <> · Shift {shift.name} <span className="num">{hhmm(shift.start_time)}–{hhmm(shift.end_time)}</span></>}
          </p>
          <p className="num mt-1 font-display text-4xl font-semibold tracking-tight sm:text-5xl" aria-live="off">
            {time}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <MapPin size={14} aria-hidden="true" />
              {loading ? 'Memuat…' : office ? `${office.name} · radius ${office.radius_m} m` : 'Kantor belum diatur'}
            </span>
            {shift && <span className="text-faint">Toleransi terlambat <span className="num">{shift.late_tolerance_min}</span> menit</span>}
          </div>
          {!loading && <RemoteTodayNote remote={att.remote} className="mt-3 max-w-md" />}
          {!loading && (
            <p className="mt-2 text-sm font-medium" aria-live="polite">{todayStatusText(att)}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 md:w-64">
          <ClockActions att={att} onSuccess={toast} size="lg" />
          <dl className="grid grid-cols-2 gap-2 text-center text-[13px]">
            <div className="rounded-lg bg-subtle px-3 py-2">
              <dt className="text-xs text-faint">Masuk</dt>
              <dd className="num font-semibold">{inTime ?? '—'}</dd>
              {inBadge && <dd className="mt-1"><Badge tone={inBadge.tone}>{inBadge.label}</Badge></dd>}
            </div>
            <div className="rounded-lg bg-subtle px-3 py-2">
              <dt className="text-xs text-faint">Pulang</dt>
              <dd className="num font-semibold">{outTime ?? '—'}</dd>
              {outTime && (
                <dd className="mt-1">
                  {today.status === 'pulang_cepat'
                    ? <Badge tone="warning">Pulang cepat</Badge>
                    : <Badge tone="success">Sesuai jadwal</Badge>}
                </dd>
              )}
            </div>
          </dl>
        </div>
      </Card>

      {/* Riwayat bulanan */}
      <Card className="mt-5">
        <CardHeader
          title="Riwayat kehadiran"
          action={
            <>
              <label htmlFor="month" className="sr-only">Bulan</label>
              <select
                id="month"
                value={month}
                onChange={(e) => { setMonth(e.target.value); setPage(1); }}
                className={cx(inputCls, 'h-8 w-auto pr-8 text-[13px]')}
              >
                {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </>
          }
        />

        <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-5 py-3">
              <dt className="text-xs text-faint">{s.label}</dt>
              <dd className={cx('num text-lg font-semibold', s.value > 0 && s.tone)}>{history.loading ? '—' : s.value}</dd>
            </div>
          ))}
        </dl>

        {history.error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-danger">Riwayat gagal dimuat.</p>
            <Button variant="secondary" className="mt-4" onClick={history.reload}>Coba lagi</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-faint">
                  <th scope="col" className="px-5 py-2.5 font-medium">Tanggal</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Masuk</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Pulang</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.loading && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Memuat…</td></tr>
                )}
                {!history.loading && days.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-muted">Belum ada data di bulan ini.</td></tr>
                )}
                {!history.loading && displayed.map((day) => (
                  <tr key={day.date} className={cx('transition-colors hover:bg-subtle', day.kind === 'libur' && 'text-faint')}>
                    <td className="px-5 py-3">
                      <span className="num">{fmtDate(day.date)}</span>
                      <span className="ml-1.5 text-faint">{weekdayName(day.date)}</span>
                      {day.isToday && <Badge tone="accent" className="ml-2">Hari ini</Badge>}
                    </td>
                    <td className={cx('num px-5 py-3', day.row?.late_minutes > 0 && 'font-medium text-warning')}>
                      {timeJakarta(day.row?.clock_in_at) ?? <span className="text-faint">—</span>}
                    </td>
                    <td className="num px-5 py-3">
                      {timeJakarta(day.row?.clock_out_at) ?? <span className="text-faint">—</span>}
                    </td>
                    <td className="px-5 py-3"><HistoryStatus day={day} /></td>
                    <td className="px-5 py-3 text-muted">{MODE_LABEL[day.row?.mode] ?? <span className="text-faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          summary={`${from}–${to} dari ${days.length} hari`}
        />
      </Card>

      <MyRequestsCard requests={myRequests} onChanged={refreshRequests} className="mt-5" />

      {modalTab && (
        <LeaveRequestModal
          types={leaveTypes}
          balance={leaveBalance.balance}
          initialTab={modalTab}
          onClose={() => setModalTab(null)}
          onSubmitted={handleSubmitLeave}
        />
      )}
      {toastNode}
    </>
  );
}
