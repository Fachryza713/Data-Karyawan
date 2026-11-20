import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import HRDashboard from './components/HRDashboard';
import { useTheme } from './components/ui';
import './index.css';

function HRApp() {
  const [currentPage, setCurrentPage] = useState('login');
  const { isDark, toggle: toggleTheme } = useTheme();

  if (currentPage === 'login') {
    return (
      <LoginPage
        isDark={isDark}
        toggleTheme={toggleTheme}
        onLogin={() => setCurrentPage('dashboard')}
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

  return <HRDashboard isDark={isDark} toggleTheme={toggleTheme} onLogout={() => setCurrentPage('login')} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HRApp />
  </React.StrictMode>,
);
