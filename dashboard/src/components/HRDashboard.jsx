import React, { useState } from 'react';
import {
  Home, Users, Clock, Wallet, TrendingUp, Settings, Download, Plus, ChevronRight, Construction,
} from 'lucide-react';
import HRAttendancePage from './HRAttendancePage';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';
import { PageHeader, Card, CardHeader, Button, Badge, Eyebrow, cx } from './ui';

const hrMenu = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'karyawan', label: 'Data karyawan', icon: Users },
  { id: 'kehadiran', label: 'Kehadiran & cuti', icon: Clock, count: 5 },
  { id: 'penggajian', label: 'Penggajian & manfaat', icon: Wallet },
  { id: 'kpi', label: 'Evaluasi kinerja', icon: TrendingUp },
];

/* ── Beranda HR ── */
const ATTENDANCE_SPLIT = [
  { label: 'Tepat waktu', value: 112, color: 'bg-success' },
  { label: 'Terlambat', value: 6, color: 'bg-warning' },
  { label: 'Cuti / izin', value: 4, color: 'bg-accent' },
  { label: 'Belum absen', value: 6, color: 'bg-line-strong' },
];
const TOTAL_EMPLOYEES = ATTENDANCE_SPLIT.reduce((s, x) => s + x.value, 0);

function Stat({ label, value, unit, note, onClick }) {
  return (
    <button type="button" onClick={onClick} className="bg-surface p-5 text-left transition-colors hover:bg-subtle">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
        <span className="num">{value}</span>
        {unit && <span className="text-sm font-medium text-faint"> {unit}</span>}
      </p>
      <p className="mt-1 text-[13px] text-muted">{note}</p>
    </button>
  );
}

function HRHome({ go }) {
  const tasks = [
    { label: 'Pengajuan cuti & izin sakit', detail: 'Batas verifikasi hari ini 17:00', count: 5, tone: 'warning', to: 'kehadiran' },
    { label: 'Presensi di luar radius kantor', detail: 'Eko Prasetyo · 3,2 km dari HQ', count: 1, tone: 'danger', to: 'kehadiran' },
    { label: 'Penilaian KPI kuartal I belum diisi', detail: 'Tenggat 31 Maret 2026', count: 20, tone: 'neutral', to: 'kpi' },
    { label: 'Review payroll Februari', detail: 'Rilis terjadwal 27 Feb 2026', count: null, tone: 'accent', to: 'penggajian' },
  ];

  return (
    <>
      <PageHeader
        title="Ringkasan HR"
        description="Senin, 24 Februari 2026"
        actions={
          <>
            <Button variant="secondary"><Download size={16} aria-hidden="true" /> Laporan bulanan</Button>
            <Button onClick={() => go('karyawan')}><Plus size={16} aria-hidden="true" /> Tambah karyawan</Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Stat label="Karyawan aktif" value="128" note="6 divisi · 18 jabatan" onClick={() => go('karyawan')} />
          <Stat label="Hadir hari ini" value="118" unit="/ 128" note="92% tingkat kehadiran" onClick={() => go('kehadiran')} />
          <Stat label="Cuti menunggu" value="5" note="Perlu persetujuan" onClick={() => go('kehadiran')} />
          <Stat label="Payroll Februari" value="85%" note="Rilis 27 Feb" onClick={() => go('penggajian')} />
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Perlu tindakan */}
        <Card className="lg:col-span-3">
          <CardHeader title="Perlu tindakan" description="Diurutkan berdasarkan tenggat terdekat" />
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <li key={task.label}>
                <button
                  type="button"
                  onClick={() => go(task.to)}
                  className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{task.label}</p>
                    <p className="text-[13px] text-muted">{task.detail}</p>
                  </div>
                  {task.count != null && <Badge tone={task.tone} className="num">{task.count}</Badge>}
                  <ChevronRight size={16} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        {/* Komposisi kehadiran */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Kehadiran hari ini"
            action={<button type="button" onClick={() => go('kehadiran')} className="text-[13px] font-medium text-accent-text hover:underline">Detail</button>}
          />
          <div className="p-5">
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img"
              aria-label={ATTENDANCE_SPLIT.map((s) => `${s.label} ${s.value}`).join(', ')}>
              {ATTENDANCE_SPLIT.map((s) => (
                <div key={s.label} className={s.color} style={{ width: `${(s.value / TOTAL_EMPLOYEES) * 100}%` }} />
              ))}
            </div>
            <dl className="mt-5 space-y-2.5">
              {ATTENDANCE_SPLIT.map((s) => (
                <div key={s.label} className="flex items-center gap-3 text-sm">
                  <span className={cx('h-2.5 w-2.5 rounded-sm', s.color)} aria-hidden="true" />
                  <dt className="flex-1 text-muted">{s.label}</dt>
                  <dd className="num font-medium">{s.value}</dd>
                  <dd className="num w-10 text-right text-faint">{Math.round((s.value / TOTAL_EMPLOYEES) * 100)}%</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>

      {/* KPI */}
      <Card className="mt-5">
        <CardHeader
          title="Evaluasi kinerja Q1 2026"
          description="Tenggat pengisian 31 Maret 2026"
          action={<Button variant="secondary" size="sm" onClick={() => go('kpi')}>Kelola KPI</Button>}
        />
        <div className="grid gap-6 p-5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Sudah dinilai</span>
              <span className="num font-medium">108 / 128</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={108} aria-valuemin={0} aria-valuemax={128} aria-label="Progres penilaian KPI">
              <div className="h-full rounded-full bg-accent" style={{ width: '84%' }} />
            </div>
            <p className="mt-2 text-[13px] text-muted">20 karyawan menunggu input penilaian dan persetujuan bonus.</p>
          </div>
          <div>
            <Eyebrow>Rata-rata skor</Eyebrow>
            <p className="mt-1 font-display text-2xl font-semibold"><span className="num">88</span><span className="text-sm font-medium text-faint"> / 100</span></p>
            <p className="text-[13px] text-muted">Grade A</p>
          </div>
        </div>
      </Card>
    </>
  );
}

/* ── Placeholder modul yang belum dibuat ── */
function HRPlaceholder({ label, go }) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <Construction size={28} strokeWidth={1.6} className="text-faint" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-semibold">{label}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">Modul ini sedang dikembangkan.</p>
      <Button variant="secondary" className="mt-5" onClick={() => go('beranda')}>Kembali ke beranda</Button>
    </Card>
  );
}

/* ── Root ── */
export default function HRDashboard({ onLogout, isDark, toggleTheme }) {
  const [activeHrTab, setActiveHrTab] = useState('beranda');
  const [menuOpen, setMenuOpen] = useState(false);
  const current = hrMenu.find((m) => m.id === activeHrTab);

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        items={hrMenu}
        active={activeHrTab}
        onSelect={setActiveHrTab}
        subtitle="Portal HR & Admin"
        onLogout={onLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        extra={
          <button
            type="button"
            className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-subtle hover:text-fg"
          >
            <Settings size={18} strokeWidth={1.8} aria-hidden="true" />
            Pengaturan
          </button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMenu={() => setMenuOpen(true)}
          userName="Dian Sastro"
          userRole="HR Manager · Human Capital"
          searchPlaceholder="Cari karyawan, NIP, atau pengajuan"
          notifCount={5}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {activeHrTab === 'beranda' ? (
            <HRHome go={setActiveHrTab} />
          ) : activeHrTab === 'kehadiran' ? (
            <HRAttendancePage />
          ) : (
            <HRPlaceholder label={current.label} go={setActiveHrTab} />
          )}
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 text-xs text-faint sm:px-6">
          <p>© 2026 Blue Rose Tech</p>
          <div className="flex flex-wrap gap-4">
            <a href="#" className="hover:text-fg">Kebijakan privasi</a>
            <a href="#" className="hover:text-fg">Pedoman HR</a>
            <a href="#" className="hover:text-fg">Bantuan IT</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
