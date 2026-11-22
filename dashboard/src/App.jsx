import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Home, User, Clock, Wallet, TrendingUp } from 'lucide-react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import WelcomeBanner from './components/WelcomeBanner';
import AttendanceCard from './components/AttendanceCard';
import LeaveQuotaCard from './components/LeaveQuotaCard';
import SalaryCard from './components/SalaryCard';
import BenefitsCard from './components/BenefitsCard';
import ProfilePage from './components/ProfilePage';
import AttendancePage from './components/AttendancePage';
import SalaryPage from './components/SalaryPage';
import PerformancePage from './components/PerformancePage';
import { useAuth, profileSubtitle } from './context/AuthContext';

const MENU = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: Clock },
  { id: 'gaji', label: 'Gaji & Manfaat', icon: Wallet },
  { id: 'kinerja', label: 'Kinerja', icon: TrendingUp },
];

/* Portal karyawan, di-mount pada /app/*. Menu aktif = segmen URL setelah /app. */
export default function EmployeePortal({ isDark, toggleTheme }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { '*': sub = '' } = useParams();
  const activeMenu = MENU.some((m) => m.id === sub) ? sub : 'beranda';
  const setActiveMenu = (id) => navigate(id === 'beranda' ? '/app' : `/app/${id}`);
  const [menuOpen, setMenuOpen] = useState(false);

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
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onOpenMenu={() => setMenuOpen(true)}
          userName={profile.full_name}
          userRole={profileSubtitle(profile)}
          profilePhoto={profile.photo_url}
          searchPlaceholder="Cari kebijakan, formulir, dokumen"
          notifCount={2}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {activeMenu === 'profil' ? (
            <ProfilePage />
          ) : activeMenu === 'kehadiran' ? (
            <AttendancePage />
          ) : activeMenu === 'gaji' ? (
            <SalaryPage />
          ) : activeMenu === 'kinerja' ? (
            <PerformancePage />
          ) : (
            <>
              <WelcomeBanner userName={profile.full_name} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <AttendanceCard setActiveMenu={setActiveMenu} className="lg:col-span-2" />
                <LeaveQuotaCard setActiveMenu={setActiveMenu} />
                <SalaryCard setActiveMenu={setActiveMenu} />
                <BenefitsCard className="lg:col-span-2" />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
