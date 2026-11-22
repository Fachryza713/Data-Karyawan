import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Semua data beranda karyawan dalam satu panggilan (RPC my_dashboard).
 * Saat dimuat ulang, data lama tetap tampil sampai data baru datang (tanpa kedip skeleton).
 */
export function useMyDashboard() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.rpc('my_dashboard');
    setState((s) => ({ loading: false, error, data: error ? s.data : data }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

const TZ = 'Asia/Jakarta';
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

/** Jam sekarang (0–23) di WIB, tidak bergantung zona waktu perangkat. */
export const hourJakarta = (d = new Date()) => Number(hourFmt.format(d));

/** Sapaan menurut jam WIB: pagi 04–10, siang 11–14, sore 15–17, malam 18–03. */
export function greetingFor(hour) {
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
