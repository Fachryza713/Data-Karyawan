import React, { useState } from 'react';
import { Home, User, Clock, Wallet } from 'lucide-react';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
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
import { useTheme } from './components/ui';

const MENU = [
  { id: 'beranda', label: 'Beranda', icon: Home },
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'kehadiran', label: 'Kehadiran & Cuti', icon: Clock },
  { id: 'gaji', label: 'Gaji & Manfaat', icon: Wallet },
];

export default function App() {
  const [currentPage, setCurrentPage] = useState('login');
  const [activeMenu, setActiveMenu] = useState('beranda');
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDark, toggle } = useTheme();
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [userName, setUserName] = useState('Raditya Pratama');

  if (currentPage === 'login') {
    return (
      <LoginPage
        isDark={isDark}
        toggleTheme={toggle}
        onLogin={() => { setActiveMenu('beranda'); setCurrentPage('dashboard'); }}
        onForgotPassword={() => setCurrentPage('reset')}
      />
    );
  }

  if (currentPage === 'reset') {
    return (
      <ResetPasswordPage
        isDark={isDark}
        toggleTheme={toggle}
        onReset={() => setCurrentPage('login')}
        onBackToLogin={() => setCurrentPage('login')}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <Sidebar
        items={MENU}
        active={activeMenu}
        onSelect={setActiveMenu}
        subtitle="Portal Karyawan"
        onLogout={() => setCurrentPage('login')}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          isDark={isDark}
          onToggleTheme={toggle}
          onOpenMenu={() => setMenuOpen(true)}
          userName={userName}
          userRole="Frontend Developer · Teknologi Informasi"
          profilePhoto={profilePhoto}
          searchPlaceholder="Cari kebijakan, formulir, dokumen"
          notifCount={2}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {activeMenu === 'profil' ? (
            <ProfilePage
              profilePhoto={profilePhoto}
              setProfilePhoto={setProfilePhoto}
              userName={userName}
              setUserName={setUserName}
            />
          ) : activeMenu === 'kehadiran' ? (
            <AttendancePage />
          ) : activeMenu === 'gaji' ? (
            <SalaryPage />
          ) : (
            <>
              <WelcomeBanner userName={userName} />
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
