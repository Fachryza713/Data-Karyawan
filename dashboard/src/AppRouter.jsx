import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, roleHome } from './context/AuthContext';
import ProtectedRoute, { FullPageLoader, PublicOnlyRoute } from './components/ProtectedRoute';
import LoginPage from './components/LoginPage';
import ResetPasswordPage from './components/ResetPasswordPage';
import UpdatePasswordPage from './components/UpdatePasswordPage';
import EmployeePortal from './App';
import HRDashboard from './components/HRDashboard';
import { useTheme } from './components/ui';

/* "/" diarahkan ke portal sesuai role, atau ke /login. */
function RootRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (session && profile?.is_active) return <Navigate to={roleHome(profile.role)} replace />;
  return <Navigate to="/login" replace />;
}

/* Link reset password dari email selalu berakhir di /update-password. */
function RecoveryRedirect() {
  const { recovery } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (recovery && pathname !== '/update-password') navigate('/update-password', { replace: true });
  }, [recovery, pathname, navigate]);
  return null;
}

export default function AppRouter() {
  const { isDark, toggle } = useTheme();
  const theme = { isDark, toggleTheme: toggle };

  return (
    <BrowserRouter>
      <RecoveryRedirect />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<PublicOnlyRoute><LoginPage {...theme} /></PublicOnlyRoute>} />
        <Route path="/reset-password" element={<PublicOnlyRoute><ResetPasswordPage {...theme} /></PublicOnlyRoute>} />
        <Route path="/update-password" element={<UpdatePasswordPage {...theme} />} />
        <Route path="/app/*" element={<ProtectedRoute role="employee"><EmployeePortal {...theme} /></ProtectedRoute>} />
        <Route path="/hr/*" element={<ProtectedRoute role="hr"><HRDashboard {...theme} /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
