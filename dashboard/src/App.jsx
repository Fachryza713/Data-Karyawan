import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Home, User, Clock, Wallet } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import EmployeeHome from './components/EmployeeHome';
import ProfilePage from './components/ProfilePage';
import AttendancePage from './components/AttendancePage';
import SalaryPage from './components/SalaryPage';
import HelpPage from './components/HelpPage';
import { useAuth, profileSubtitle } from './context/AuthContext';

const MENU = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: Clock },
  { id: 'gaji', label: 'Gaji & Manfaat', icon: Wallet },
];

/* Portal karyawan, di-mount pada /app/*. Menu aktif = segmen URL setelah /app.
   /app/bantuan = halaman Bantuan (tombol di bawah sidebar, bukan item menu).
   Segmen yang tidak dikenal (mis. /app/kinerja yang sudah dihapus) diarahkan ke Beranda. */
export default function EmployeePortal({ isDark, toggleTheme }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { '*': sub = '' } = useParams();
  const knownMenu = MENU.some((m) => m.id === sub);
  const isHelp = sub === 'bantuan';
  const activeMenu = knownMenu ? sub : isHelp ? null : 'beranda';
  const setActiveMenu = (id) => navigate(id === 'beranda' ? '/app' : `/app/${id}`);
  const [menuOpen, setMenuOpen] = useState(false);

  if (sub && !knownMenu && !isHelp) return <Navigate to="/app" replace />;

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        items={MENU}
        active={activeMenu}
        onSelect={setActiveMenu}
        subtitle="Portal Karyawan"
        onLogout={handleLogout}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onHelp={() => navigate('/app/bantuan')}
        helpActive={isHelp}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenProfile={() => setActiveMenu('profil')}
          userName={profile.full_name}
          userRole={profileSubtitle(profile)}
          profilePhoto={profile.photo_url}
          searchPlaceholder="Cari kebijakan, formulir, dokumen"
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {isHelp ? (
            <HelpPage role="employee" />
          ) : activeMenu === 'profil' ? (
            <ProfilePage />
          ) : activeMenu === 'kehadiran' ? (
            <AttendancePage />
          ) : activeMenu === 'gaji' ? (
            <SalaryPage />
          ) : (
            <EmployeeHome setActiveMenu={setActiveMenu} />
          )}
        </main>
      </div>
    </div>
  );
}
