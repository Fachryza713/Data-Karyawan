import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const PROFILE_SELECT = '*, division:divisions(name), position:positions(name)';

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Halaman awal sesuai role. */
export const roleHome = (role) => (role === 'hr' ? '/hr' : '/app');

/** "Jabatan · Divisi" dari profil, untuk header. */
export const profileSubtitle = (profile) =>
  [profile?.position?.name, profile?.division?.name].filter(Boolean).join(' · ');

/** Ubah error Supabase Auth jadi kode yang aman ditampilkan (tidak membocorkan apakah email terdaftar). */
function authErrorCode(error) {
  if (!error) return null;
  if (error.status === 429) return 'rate_limit';
  if (!error.status || error.status >= 500 || error.name === 'AuthRetryableFetchError') return 'network';
  return 'invalid';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false); // sesi awal sudah dibaca dari storage
  const [recovery, setRecovery] = useState(false); // sesi dari link reset password
  // Profil disimpan bersama userId pemiliknya supaya status loading bisa dihitung tanpa race.
  const [profileState, setProfileState] = useState({ userId: null, data: null, error: null });

  useEffect(() => {
    // INITIAL_SESSION dikirim sekali saat subscribe, jadi tidak perlu getSession() terpisah.
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfileState({ userId: null, data: null, error: null });
      return undefined;
    }
    let cancelled = false;
    fetchProfile(userId)
      .then((data) => { if (!cancelled) setProfileState({ userId, data, error: null }); })
      .catch((error) => { if (!cancelled) setProfileState({ userId, data: null, error }); });
    return () => { cancelled = true; };
  }, [userId]);

  const loading = !ready || (userId !== null && profileState.userId !== userId);
  const profile = userId && profileState.userId === userId ? profileState.data : null;

  /**
   * Login email + password. Mengembalikan { profile } atau { error: kode }.
   * Kode: invalid | rate_limit | network | no_profile | inactive.
   */
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: authErrorCode(error) };

    let p = null;
    try {
      p = await fetchProfile(data.user.id);
    } catch {
      await supabase.auth.signOut();
      return { error: 'network' };
    }
    if (!p || !p.is_active) {
      await supabase.auth.signOut();
      return { error: p ? 'inactive' : 'no_profile' };
    }
    setProfileState({ userId: data.user.id, data: p, error: null });
    return { profile: p };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // Kalau server gagal dihubungi, tetap hapus sesi lokal supaya user benar-benar keluar.
    if (error) await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return null;
    const data = await fetchProfile(userId);
    setProfileState({ userId, data, error: null });
    return data;
  }, [userId]);

  const clearRecovery = useCallback(() => setRecovery(false), []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      profileError: profileState.error,
      loading,
      initializing: !ready,
      recovery,
      signIn,
      signOut,
      refreshProfile,
      clearRecovery,
    }),
    [session, profile, profileState.error, loading, ready, recovery, signIn, signOut, refreshProfile, clearRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  return ctx;
}
