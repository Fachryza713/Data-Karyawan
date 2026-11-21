import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth, roleHome } from '../context/AuthContext';
import { Button } from './ui';

export function FullPageLoader({ label = 'Memuat…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-muted" role="status" aria-live="polite">
      <Loader2 size={22} className="animate-spin" aria-hidden="true" />
      <span className="ml-2.5 text-sm">{label}</span>
    </div>
  );
}

/* Sesi ada, tapi profil tidak ditemukan / nonaktif / gagal dimuat. */
function NoAccess() {
  const { profile, profileError, signOut } = useAuth();
  const message = profileError
    ? 'Profil Anda gagal dimuat. Periksa koneksi lalu muat ulang halaman.'
    : profile && !profile.is_active
      ? 'Akun Anda sudah dinonaktifkan. Hubungi HR bila ini keliru.'
      : 'Akun Anda belum terdaftar sebagai karyawan. Hubungi HR.';

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 text-fg">
      <div className="max-w-sm text-center">
        <ShieldAlert size={28} strokeWidth={1.6} className="mx-auto text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Tidak bisa membuka portal</h1>
        <p className="mt-1 text-sm text-muted">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          {profileError && (
            <Button variant="secondary" onClick={() => window.location.reload()}>Muat ulang</Button>
          )}
          <Button onClick={signOut}>Keluar</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Halaman yang butuh login dengan role tertentu.
 * Tanpa sesi: ke /login. Role lain: ke portal miliknya sendiri.
 */
export default function ProtectedRoute({ role, children }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile || !profile.is_active) return <NoAccess />;
  if (profile.role !== role) return <Navigate to={roleHome(profile.role)} replace />;
  return children;
}

/** Halaman tamu (login, lupa password). User yang sudah login langsung ke portalnya. */
export function PublicOnlyRoute({ children }) {
  const { session, profile, loading, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <FullPageLoader />;
  if (!loading && session && profile?.is_active) {
    const home = roleHome(profile.role);
    const from = location.state?.from;
    return <Navigate to={from?.startsWith(home) ? from : home} replace />;
  }
  return children;
}
