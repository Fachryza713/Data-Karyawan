import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export const PANEL_LIMIT = 20;

const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

/** "baru saja" / "5 menit yang lalu" / "kemarin" / "12 Nov 2026" (lebih dari seminggu). */
export function timeAgo(ts, now = Date.now()) {
  const sec = Math.round((Date.parse(ts) - now) / 1000);
  if (sec > -45) return 'baru saja';
  if (sec > -3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (sec > -86_400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (sec > -7 * 86_400) return rtf.format(Math.round(sec / 86_400), 'day');
  return dateFmt.format(new Date(ts));
}

/**
 * Notifikasi milik user login: 20 terbaru + jumlah belum dibaca, diperbarui lewat Supabase Realtime
 * (INSERT/UPDATE pada baris user_id = userId; RLS memastikan hanya baris sendiri yang terkirim).
 */
export function useNotifications(userId) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], unread: 0 });
  const reloadTimer = useRef(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const [list, count] = await Promise.all([
      supabase.from('notifications')
        .select('id, type, title, body, link, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PANEL_LIMIT),
      supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null),
    ]);
    const error = list.error || count.error;
    setState((s) => ({
      loading: false,
      error,
      rows: error ? s.rows : list.data ?? [],
      unread: error ? s.unread : count.count ?? 0,
    }));
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    load();
    // Muat ulang sekali untuk rentetan perubahan (mis. "tandai semua dibaca" memicu banyak UPDATE).
    const schedule = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(load, 250);
    };
    // Topik unik per pemasangan: efek ganda StrictMode tidak boleh memakai ulang channel yang sedang dilepas.
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, schedule)
      .subscribe((status) => { if (status === 'SUBSCRIBED') schedule(); });
    return () => {
      clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  /** Tandai satu notifikasi dibaca (optimistis; Realtime/muat ulang menyelaraskan). */
  const markRead = useCallback(async (id) => {
    let changed = false;
    setState((s) => {
      const rows = s.rows.map((n) => {
        if (n.id !== id || n.read_at) return n;
        changed = true;
        return { ...n, read_at: new Date().toISOString() };
      });
      return changed ? { ...s, rows, unread: Math.max(0, s.unread - 1) } : s;
    });
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id).is('read_at', null);
    if (error) load();
    return error;
  }, [load]);

  /** Tandai semua notifikasi milik user dibaca. */
  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setState((s) => ({ ...s, unread: 0, rows: s.rows.map((n) => (n.read_at ? n : { ...n, read_at: now })) }));
    const { error } = await supabase.from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId).is('read_at', null);
    if (error) load();
    return error;
  }, [userId, load]);

  return { ...state, reload: load, markRead, markAllRead };
}
