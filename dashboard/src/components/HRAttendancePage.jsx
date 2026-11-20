import React, { useMemo, useState } from 'react';
import { Download, Clock, RefreshCw, Paperclip, Check, X, MapPin } from 'lucide-react';
import {
  PageHeader, Card, CardHeader, Badge, Button, IconButton, Modal, Avatar, Eyebrow, Pagination, useToast, inputCls, cx,
} from './ui';

/* ── data awal ── */
const INITIAL_REQUESTS = [
  {
    id: 1, name: 'Raditya Pratama', nip: 'BRT-2023-0884', division: 'Teknologi Informasi', position: 'Frontend Developer',
    type: 'cuti', typeLabel: 'Cuti tahunan', days: 2, dates: '26–27 Feb 2026',
    reason: 'Acara keluarga dan perpanjangan dokumen pribadi di luar kota.',
    attachment: null, quota: '8 hari', submitted: '24 Feb, 09:12', category: null, status: 'pending',
  },
  {
    id: 2, name: 'Sarah Anindita', nip: 'BRT-2022-019', division: 'Human Capital', position: 'People Ops Lead',
    type: 'sakit', typeLabel: 'Sakit', days: 1, dates: '24 Feb 2026',
    reason: 'Demam tinggi dan flu, surat keterangan dokter terlampir.',
    attachment: 'Surat Dokter.pdf', quota: null, submitted: '24 Feb, 07:45', category: 'Rawat jalan', status: 'pending',
  },
  {
    id: 3, name: 'Dimas Pratama', nip: 'BRT-2024-002', division: 'Pemasaran & Komunikasi', position: 'Digital Growth Specialist',
    type: 'cuti', typeLabel: 'Izin khusus', days: 1, dates: '28 Feb 2026',
    reason: 'Mengurus administrasi wisuda universitas.',
    attachment: null, quota: null, submitted: '23 Feb, 16:30', category: 'Sesuai PKB', status: 'pending',
  },
  {
    id: 4, name: 'Rina Kusuma', nip: 'BRT-2023-055', division: 'Operasional', position: 'Supply Chain Analyst',
    type: 'cuti', typeLabel: 'Cuti tahunan', days: 3, dates: '3–5 Mar 2026',
    reason: 'Liburan keluarga ke Bali.',
    attachment: null, quota: '10 hari', submitted: '22 Feb, 14:20', category: null, status: 'pending',
  },
  {
    id: 5, name: 'Arief Hidayat', nip: 'BRT-2021-033', division: 'Keuangan', position: 'Tax Specialist',
    type: 'sakit', typeLabel: 'Sakit', days: 2, dates: '24–25 Feb 2026',
    reason: 'Rawat jalan pasca operasi gigi bungsu.',
    attachment: 'Rujukan RS.pdf', quota: null, submitted: '23 Feb, 20:05', category: 'Rawat jalan', status: 'pending',
  },
];

const ATTENDANCE_LOG = [
  { name: 'Raditya Pratama', nip: 'BRT-2023-0884', division: 'Teknologi Informasi', position: 'Frontend Developer', in: '08:15', out: '17:35', gps: 'HQ Jakarta', radius: '15 m', status: 'hadir' },
  { name: 'Budi Santoso', nip: 'BRT-2021-045', division: 'Keuangan', position: 'Finance Controller', in: '08:24', out: '17:30', gps: 'HQ Jakarta', radius: '22 m', status: 'hadir' },
  { name: 'Citra Dewi', nip: 'BRT-2023-112', division: 'Produk & Desain', position: 'UI/UX Specialist', in: '08:42', out: '17:40', gps: 'HQ Jakarta', radius: '10 m', status: 'terlambat', lateMin: 12 },
  { name: 'Eko Prasetyo', nip: 'BRT-2022-078', division: 'Teknologi Informasi', position: 'Backend Engineer', in: '08:45', out: null, gps: null, radius: '3,2 km', status: 'luar-radius' },
  { name: 'Nadia Putri', nip: 'BRT-2023-091', division: 'Operasional', position: 'Project Coordinator', in: null, out: null, gps: null, radius: null, status: 'cuti' },
];

const DIVISIONS = ['Semua divisi', 'Teknologi Informasi', 'Keuangan', 'Produk & Desain', 'Operasional', 'Human Capital', 'Pemasaran & Komunikasi'];
const STATUSES = [
  { value: 'semua', label: 'Semua status' },
  { value: 'hadir', label: 'Tepat waktu' },
  { value: 'terlambat', label: 'Terlambat' },
  { value: 'luar-radius', label: 'Di luar radius' },
  { value: 'cuti', label: 'Cuti' },
];

const METRICS = [
  { label: 'Tepat waktu', value: 112, note: '87,5% dari total' },
  { label: 'Terlambat', value: 6, note: 'Rata-rata 12 menit', tone: 'text-warning' },
  { label: 'Cuti / sakit', value: 4, note: 'Sudah disetujui' },
  { label: 'Di luar radius', value: 1, note: 'Perlu klarifikasi', tone: 'text-danger' },
];

function StatusBadge({ row }) {
  switch (row.status) {
    case 'hadir': return <Badge tone="success" dot>Tepat waktu</Badge>;
    case 'terlambat': return <Badge tone="warning" dot>Terlambat {row.lateMin} mnt</Badge>;
    case 'luar-radius': return <Badge tone="danger" dot>Di luar radius</Badge>;
    case 'cuti': return <Badge tone="accent">Cuti</Badge>;
    default: return null;
  }
}

const typeTone = (r) => (r.type === 'sakit' ? 'warning' : r.typeLabel === 'Izin khusus' ? 'neutral' : 'accent');

export default function HRAttendancePage() {
  const [requests, setRequests] = useState(INITIAL_REQUESTS);
  const [filterTab, setFilterTab] = useState('semua');
  const [page, setPage] = useState(1);
  const [divisionFilter, setDivisionFilter] = useState(DIVISIONS[0]);
  const [statusFilter, setStatusFilter] = useState('semua');
  const [docModal, setDocModal] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [toast, toastNode] = useToast();

  const handleAction = (r, action) => {
    setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: action } : x)));
    toast(
      action === 'approved' ? `Pengajuan ${r.name} disetujui.` : `Pengajuan ${r.name} ditolak.`,
      action === 'approved' ? 'success' : 'error',
    );
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const tabs = [
    { id: 'semua', label: 'Semua', count: pending.length },
    { id: 'cuti', label: 'Cuti & izin', count: pending.filter((r) => r.type === 'cuti').length },
    { id: 'sakit', label: 'Sakit', count: pending.filter((r) => r.type === 'sakit').length },
  ];
  const filtered = pending.filter((r) => filterTab === 'semua' || r.type === filterTab);
  const visible = showAll ? filtered : filtered.slice(0, 3);
  const hiddenCount = filtered.length - visible.length;

  const logRows = useMemo(
    () => ATTENDANCE_LOG.filter((r) =>
      (divisionFilter === DIVISIONS[0] || r.division === divisionFilter) &&
      (statusFilter === 'semua' || r.status === statusFilter)),
    [divisionFilter, statusFilter],
  );

  return (
    <>
      <PageHeader
        title="Kehadiran & cuti"
        description="Senin, 24 Februari 2026 · Head Office Jakarta"
        actions={
          <>
            <Button variant="secondary"><Clock size={16} aria-hidden="true" /> Atur shift</Button>
            <Button variant="secondary"><Download size={16} aria-hidden="true" /> Ekspor</Button>
          </>
        }
      />

      {/* Metrik */}
      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="bg-surface p-5">
              <dt><Eyebrow>{m.label}</Eyebrow></dt>
              <dd className={cx('num mt-1 font-display text-2xl font-semibold', m.tone)}>{m.value}</dd>
              <dd className="mt-0.5 text-[13px] text-muted">{m.note}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Antrean persetujuan */}
      <Card className="mt-5">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-semibold">Menunggu persetujuan</h2>
          <div role="tablist" aria-label="Filter pengajuan" className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filterTab === t.id}
                onClick={() => { setFilterTab(t.id); setShowAll(false); }}
                className={cx(
                  'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                  filterTab === t.id ? 'bg-subtle text-fg ring-1 ring-line-strong' : 'text-muted hover:text-fg',
                )}
              >
                {t.label} <span className="num text-faint">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">Tidak ada pengajuan yang menunggu.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((r) => (
              <li key={r.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row">
                <Avatar name={r.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-[13px] text-faint">{r.position} · {r.division}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <Badge tone={typeTone(r)}>{r.typeLabel}</Badge>
                    <span className="num text-fg">{r.dates}</span>
                    <span className="text-faint">· {r.days} hari</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{r.reason}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                    {r.attachment && (
                      <button
                        type="button"
                        onClick={() => setDocModal(r)}
                        className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
                      >
                        <Paperclip size={12} aria-hidden="true" /> {r.attachment}
                      </button>
                    )}
                    {r.quota && <span>Sisa kuota {r.quota}</span>}
                    {r.category && <span>{r.category}</span>}
                    <span>Diajukan {r.submitted}</span>
                  </div>
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <Button size="sm" onClick={() => handleAction(r, 'approved')}>
                    <Check size={14} aria-hidden="true" /> Setujui
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleAction(r, 'rejected')}>
                    <X size={14} aria-hidden="true" /> Tolak
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {hiddenCount > 0 && (
          <div className="border-t border-line px-5 py-3 text-center">
            <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-medium text-accent-text hover:underline">
              Tampilkan {hiddenCount} lainnya
            </button>
          </div>
        )}
      </Card>

      {/* Log presensi */}
      <Card className="mt-5">
        <CardHeader
          title="Log presensi"
          action={
            <>
              <label htmlFor="f-div" className="sr-only">Divisi</label>
              <select id="f-div" value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className={cx(inputCls, 'hidden h-8 w-auto pr-8 text-[13px] sm:block')}>
                {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
              </select>
              <label htmlFor="f-status" className="sr-only">Status</label>
              <select id="f-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={cx(inputCls, 'h-8 w-auto pr-8 text-[13px]')}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <IconButton label="Muat ulang" className="h-8 w-8"><RefreshCw size={15} /></IconButton>
            </>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-faint">
                <th scope="col" className="px-5 py-2.5 font-medium">Karyawan</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Divisi</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Masuk</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Pulang</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Lokasi</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logRows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">Tidak ada data yang cocok dengan filter.</td></tr>
              )}
              {logRows.map((row) => (
                <tr key={row.nip} className="transition-colors hover:bg-subtle">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} size={30} />
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="num text-xs text-faint">{row.nip}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p>{row.division}</p>
                    <p className="text-xs text-faint">{row.position}</p>
                  </td>
                  <td className={cx('num px-5 py-3', row.status === 'terlambat' && 'font-medium text-warning')}>
                    {row.in ?? <span className="text-faint">—</span>}
                  </td>
                  <td className="num px-5 py-3">{row.out ?? <span className="text-faint">—</span>}</td>
                  <td className="px-5 py-3">
                    {row.status === 'luar-radius' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-danger">
                        <MapPin size={13} aria-hidden="true" /> {row.radius} dari HQ
                      </span>
                    ) : row.gps ? (
                      <span className="text-muted">{row.gps} <span className="text-faint">· {row.radius}</span></span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3"><StatusBadge row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={3} onChange={setPage} summary={`${logRows.length} dari 128 karyawan`} />
      </Card>

      {docModal && (
        <Modal
          size="sm"
          title={docModal.attachment}
          description={`Lampiran pengajuan ${docModal.name}`}
          onClose={() => setDocModal(null)}
          footer={<Button variant="secondary" onClick={() => setDocModal(null)}>Tutup</Button>}
        >
          <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
            <dt className="text-faint">Penerbit</dt><dd>dr. Andini, Sp.PD — RS Pertamina Jaya</dd>
            <dt className="text-faint">Tanggal</dt><dd>23 Februari 2026</dd>
            <dt className="text-faint">Diagnosis</dt><dd>ISPA</dd>
            <dt className="text-faint">Istirahat</dt><dd>1 hari kerja</dd>
          </dl>
        </Modal>
      )}
      {toastNode}
    </>
  );
}
