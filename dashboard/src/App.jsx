import React, { useState } from 'react';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import WelcomeBanner from './components/WelcomeBanner';
import AttendanceCard from './components/AttendanceCard';
import LeaveQuotaCard from './components/LeaveQuotaCard';
import SalaryCard from './components/SalaryCard';
import BenefitsCard from './components/BenefitsCard';
import './auth.css';

export default function App() {
  const [currentPage, setCurrentPage] = useState('login');
  const [activeMenu, setActiveMenu] = useState('beranda');
  const [isDark, setIsDark] = useState(false);

  const toggleTheme = () => setIsDark((prev) => !prev);

  if (currentPage === 'login') {
    return (
      <LoginPage
        isDark={isDark}
        toggleTheme={toggleTheme}
        onLogin={() => { setActiveMenu('beranda'); setCurrentPage('dashboard'); }}
        onForgotPassword={() => setCurrentPage('reset')}
      />
    );
  }

  if (currentPage === 'reset') {
    return (
      <ResetPasswordPage
        isDark={isDark}
        toggleTheme={toggleTheme}
        onReset={() => setCurrentPage('login')}
        onBackToLogin={() => setCurrentPage('login')}
      />
    );
  }

  return (
    <div className={`flex min-h-screen font-body transition-colors duration-300 ${isDark ? 'bg-[#0B1120] text-slate-100' : 'bg-slate-50 text-[#0F172A]'}`}>
      <Sidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} isDark={isDark} onLogout={() => setCurrentPage('login')} />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopHeader isDark={isDark} setIsDark={setIsDark} />
        <main className="flex-1 p-6 overflow-y-auto">
          <WelcomeBanner isDark={isDark} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <AttendanceCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <LeaveQuotaCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <SalaryCard setActiveMenu={setActiveMenu} isDark={isDark} />
            <BenefitsCard isDark={isDark} />
          </div>
        </main>
      </div>
    </div>
  );
}
