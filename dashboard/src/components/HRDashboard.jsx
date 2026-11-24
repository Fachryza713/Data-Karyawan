import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Home, User, Users, Clock, Wallet, TrendingUp, Settings, Construction,
} from 'lucide-react';
import HRAttendancePage from './HRAttendancePage';
import ProfilePage from './ProfilePage';
import EmployeesModule from './hr/EmployeesModule';
import SettingsPage from './hr/SettingsPage';
import PayrollModule from './hr/PayrollModule';
import KpiModule from './hr/KpiModule';
import HRHome from './hr/HRHome';
import HelpPage from './HelpPage';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';
import { Card, Button, cx } from './ui';
import { useAuth, profileSubtitle } from '../context/AuthContext';
import { usePendingRequestCount } from '../lib/leave';

const hrMenu = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'karyawan', label: 'Data karyawan', icon: Users },
  { id: 'kehadiran', label: 'Kehadiran & cuti', icon: Clock },
  { id: 'penggajian', label: 'Penggajian & manfaat', icon: Wallet },
  { id: 'kpi', label: 'Evaluasi kinerja', icon: TrendingUp },
];

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
/* Portal HR, di-mount pada /hr/*. Menu aktif = segmen URL setelah /hr.
   /hr/pengaturan dan /hr/bantuan dibuka dari tombol di bawah sidebar, bukan item menu. */
export default function HRDashboard({ isDark, toggleTheme }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { '*': sub = '' } = useParams();
  const section = sub.split('/')[0];
  const isSettings = section === 'pengaturan';
  const isHelp = section === 'bantuan';
  const activeHrTab = hrMenu.some((m) => m.id === section) ? section : isSettings || isHelp ? null : 'beranda';
  const setActiveHrTab = (id) => navigate(id === 'beranda' ? '/hr' : `/hr/${id}`);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = hrMenu.find((m) => m.id === activeHrTab);
  const pendingCount = usePendingRequestCount();
  const reloadPendingCount = pendingCount.reload;
  // Badge "Kehadiran & cuti" = jumlah pengajuan menunggu; disegarkan setiap pindah menu.
  useEffect(() => { reloadPendingCount(); }, [section, reloadPendingCount]);
  const menuItems = hrMenu.map((m) => (m.id === 'kehadiran' && pendingCount.count > 0 ? { ...m, count: pendingCount.count } : m));

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        items={menuItems}
        active={activeHrTab}
        onSelect={setActiveHrTab}
        subtitle="Portal HR & Admin"
        onLogout={handleLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHelp={() => navigate('/hr/bantuan')}
        helpActive={isHelp}
        extra={
          <button
            type="button"
            onClick={() => { navigate('/hr/pengaturan'); setMenuOpen(false); }}
            aria-current={isSettings ? 'page' : undefined}
            className={cx(
              'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
              isSettings ? 'bg-accent-soft font-medium text-accent-text' : 'text-muted hover:bg-subtle hover:text-fg',
            )}
          >
            <Settings size={18} strokeWidth={isSettings ? 2.1 : 1.8} aria-hidden="true" />
            Pengaturan
          </button>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenProfile={() => setActiveHrTab('profil')}
          userName={profile.full_name}
          userRole={profileSubtitle(profile)}
          profilePhoto={profile.photo_url}
          searchPlaceholder="Cari karyawan, NIP, atau pengajuan"
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {isSettings ? (
            <SettingsPage tab={sub.split('/')[1]} />
          ) : isHelp ? (
            <HelpPage role="hr" />
          ) : activeHrTab === 'beranda' ? (
            <HRHome go={setActiveHrTab} />
          ) : activeHrTab === 'profil' ? (
            <ProfilePage />
          ) : activeHrTab === 'karyawan' ? (
            <EmployeesModule />
          ) : activeHrTab === 'kehadiran' ? (
            <HRAttendancePage onRequestsChanged={reloadPendingCount} />
          ) : activeHrTab === 'penggajian' ? (
            <PayrollModule />
          ) : activeHrTab === 'kpi' ? (
            <KpiModule />
          ) : (
            <HRPlaceholder label={current.label} go={setActiveHrTab} />
          )}
        </main>
        <footer className="border-t border-line px-4 py-4 text-xs text-faint sm:px-6">
          <p>© {new Date().getFullYear()} Blue Rose Tech</p>
        </footer>
      </div>
    </div>
  );
}
