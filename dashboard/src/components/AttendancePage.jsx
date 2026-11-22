import React, { useState, useEffect } from 'react';
import { MapPin, Plus } from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, Modal, Field, Segmented, Pagination, useToast, inputCls, cx,
} from './ui';
import ClockActions, { todayStatusText } from './ClockActions';
import { useTodayAttendance, timeJakarta, longDateJakarta, clockInBadge, hhmm } from '../lib/useTodayAttendance';

const INITIAL_LOG = [
  { date: '2026-02-24', day: 'Senin', in: '08:15', out: null, status: 'hadir', today: true },
  { date: '2026-02-23', day: 'Minggu', in: null, out: null, status: 'libur' },
  { date: '2026-02-22', day: 'Sabtu', in: null, out: null, status: 'libur' },
  { date: '2026-02-21', day: 'Jumat', in: '08:20', out: '17:35', status: 'hadir' },
  { date: '2026-02-20', day: 'Kamis', in: '08:42', out: '17:45', status: 'terlambat', lateMin: 12 },
  { date: '2026-02-19', day: 'Rabu', in: null, out: null, status: 'cuti', note: 'Cuti tahunan' },
  { date: '2026-02-18', day: 'Selasa', in: '08:10', out: '17:30', status: 'hadir' },
  { date: '2026-02-17', day: 'Senin', in: '08:38', out: '17:40', status: 'terlambat', lateMin: 8 },
];

const MONTHS = [
  { value: '2026-01', label: 'Januari 2026' },
  { value: '2026-02', label: 'Februari 2026' },
];

const LEAVE_TYPES = [
  { value: 'cuti', label: 'Cuti tahunan' },
  { value: 'sakit', label: 'Sakit' },
  { value: 'izin', label: 'Izin khusus' },
];

const PER_PAGE = 8;

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

function StatusBadge({ row }) {
  switch (row.status) {
    case 'hadir': return <Badge tone="success" dot>Tepat waktu</Badge>;
    case 'terlambat': return <Badge tone="warning" dot>Terlambat {row.lateMin} mnt</Badge>;
    case 'cuti': return <Badge tone="accent">{row.note || 'Cuti tahunan'}</Badge>;
    case 'libur': return <Badge>Libur</Badge>;
    default: return null;
  }
}

function LeaveModal({ onClose, onSubmit }) {
  const [type, setType] = useState('cuti');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!start) next.start = 'Pilih tanggal mulai.';
    if (end && start && end < start) next.end = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    if (!reason.trim()) next.reason = 'Tuliskan alasan singkat.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({ type, start, end, reason });
  };

  return (
    <Modal
      title="Ajukan cuti atau izin"
      description="Pengajuan dikirim ke atasan langsung dan HR."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button type="submit" form="leave-form">Kirim pengajuan</Button>
        </>
      }
    >
      <form id="leave-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Jenis">
          <Segmented name="Jenis pengajuan" options={LEAVE_TYPES} value={type} onChange={setType} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mulai" required htmlFor="leave-start">
            <input
              id="leave-start" type="date" value={start} onChange={(e) => setStart(e.target.value)}
              aria-invalid={!!errors.start} className={cx(inputCls, errors.start && 'border-danger')}
            />
            {errors.start && <p className="mt-1.5 text-xs text-danger">{errors.start}</p>}
          </Field>
          <Field label="Selesai" htmlFor="leave-end" aside="Opsional">
            <input
              id="leave-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)}
              aria-invalid={!!errors.end} className={cx(inputCls, errors.end && 'border-danger')}
            />
            {errors.end && <p className="mt-1.5 text-xs text-danger">{errors.end}</p>}
          </Field>
        </div>
        <Field label="Alasan" required htmlFor="leave-reason">
          <textarea
            id="leave-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: acara keluarga di luar kota"
            aria-invalid={!!errors.reason}
            className={cx(inputCls, 'h-auto resize-none py-2', errors.reason && 'border-danger')}
          />
          {errors.reason && <p className="mt-1.5 text-xs text-danger">{errors.reason}</p>}
        </Field>
        {type === 'cuti' && <p className="text-[13px] text-muted">Sisa cuti tahunan Anda: <span className="num font-medium text-fg">8 hari</span>.</p>}
        {type === 'sakit' && <p className="text-[13px] text-muted">Lebih dari 1 hari wajib melampirkan surat dokter.</p>}
      </form>
    </Modal>
  );
}

export default function AttendancePage() {
  const [now, setNow] = useState(new Date());
  const att = useTodayAttendance();
  const [logData, setLogData] = useState(INITIAL_LOG);
  const [page, setPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState('2026-02');
  const [showModal, setShowModal] = useState(false);
  const [toast, toastNode] = useToast();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { today, office, shift, loading } = att;
  const inTime = timeJakarta(today?.clock_in_at);
  const outTime = timeJakarta(today?.clock_out_at);
  const inBadge = clockInBadge(today);

  const handleSubmitLeave = ({ type, start }) => {
    const label = LEAVE_TYPES.find((t) => t.value === type)?.label;
    const day = new Date(start + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long' });
    setLogData((prev) => [{ date: start, day, in: null, out: null, status: 'cuti', note: label }, ...prev]);
    setShowModal(false);
    toast('Pengajuan terkirim. Status bisa dipantau di log.');
  };

  const totalPages = Math.max(1, Math.ceil(logData.length / PER_PAGE));
  const displayed = logData.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const from = (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, logData.length);
  const time = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  return (
    <>
      <PageHeader
        title="Kehadiran & cuti"
        description="Presensi harian dan riwayat kehadiran Anda."
        actions={<Button onClick={() => setShowModal(true)}><Plus size={16} aria-hidden="true" /> Ajukan cuti / izin</Button>}
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
          {!loading && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium" aria-live="polite">
              {todayStatusText(att)}
              {today?.status === 'pulang_cepat' && <Badge tone="warning">Pulang cepat</Badge>}
            </p>
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
            </div>
          </dl>
        </div>
      </Card>

      {/* Log bulanan */}
      <Card className="mt-5">
        <CardHeader
          title="Riwayat kehadiran"
          action={
            <>
              <label htmlFor="month" className="sr-only">Bulan</label>
              <select
                id="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={cx(inputCls, 'h-8 w-auto pr-8 text-[13px]')}
              >
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Tanggal</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Masuk</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Pulang</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {displayed.map((row, i) => (
                <tr key={`${row.date}-${i}`} className={cx('transition-colors hover:bg-subtle', row.status === 'libur' && 'text-faint')}>
                  <td className="px-5 py-3">
                    <span className="num">{fmtDate(row.date)}</span>
                    <span className="ml-1.5 text-faint">{row.day}</span>
                    {row.today && <Badge tone="accent" className="ml-2">Hari ini</Badge>}
                  </td>
                  <td className={cx('num px-5 py-3', row.status === 'terlambat' && 'font-medium text-warning')}>
                    {row.in ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="num px-5 py-3">
                    {row.out ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="px-5 py-3"><StatusBadge row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onChange={setPage}
          summary={`${from}–${to} dari ${logData.length} hari`}
        />
      </Card>

      {showModal && <LeaveModal onClose={() => setShowModal(false)} onSubmit={handleSubmitLeave} />}
      {toastNode}
    </>
  );
}
