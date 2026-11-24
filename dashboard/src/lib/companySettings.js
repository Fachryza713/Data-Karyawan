import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/*
 * Pengaturan perusahaan (tabel company_settings). Dibaca semua user login, ditulis HR (RLS).
 * Kontak bantuan: { email, whatsapp: '62…', hours }.
 */
export const CONTACT_KEYS = { hr: 'hr_contact', admin: 'admin_contact' };

// Sama dengan CHECK di migrasi 20261124000000_company_settings.sql.
export const CONTACT_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const WHATSAPP_RE = /^62[1-9][0-9]{7,11}$/;
export const HOURS_MAX = 100;

/** "0812-3456 7890" / "+62 812…" -> "628123456789…". Tidak memvalidasi. */
export function normalizeWhatsapp(input) {
  let n = String(input ?? '').replace(/[\s\-().]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  return n;
}

/** "6281234567890" -> "+62 812-3456-7890" (tampilan saja). */
export function formatWhatsapp(n) {
  if (!n) return '';
  const local = String(n).slice(2);
  const parts = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return `+62 ${parts.join('-')}`;
}

/** Validasi isian form kontak. Mengembalikan { email?, whatsapp?, hours? }. */
export function validateContact({ email, whatsapp, hours }) {
  const e = {};
  const mail = email.trim();
  if (!mail) e.email = 'Email wajib diisi.';
  else if (mail.length > 254 || !CONTACT_EMAIL_RE.test(mail)) e.email = 'Format email tidak valid. Contoh: hr@perusahaan.co.id.';
  const wa = normalizeWhatsapp(whatsapp);
  if (!wa) e.whatsapp = 'Nomor WhatsApp wajib diisi.';
  else if (!WHATSAPP_RE.test(wa)) e.whatsapp = 'Nomor harus diawali 62 dan berisi 10–14 digit. Contoh: 6281234567890.';
  const h = hours.trim();
  if (!h) e.hours = 'Jam layanan wajib diisi.';
  else if (h.length > HOURS_MAX) e.hours = `Jam layanan maksimal ${HOURS_MAX} karakter.`;
  return e;
}

export const mailtoHref = (email, senderName) =>
  `mailto:${email}?subject=${encodeURIComponent(`[HRIS] Pertanyaan dari ${senderName || 'karyawan'}`)}`;

export const whatsappHref = (number) => `https://wa.me/${number}`;

/** Kontak dianggap lengkap bila lolos format yang sama dengan CHECK di database. */
export const isContactComplete = (c) =>
  !!c && CONTACT_EMAIL_RE.test(c.email ?? '') && WHATSAPP_RE.test(c.whatsapp ?? '') && !!c.hours?.trim();

/** Satu baris company_settings. value = null jika key belum ada. */
export function useCompanySetting(key) {
  const [state, setState] = useState({ loading: true, error: null, value: null, updatedAt: null });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase
      .from('company_settings')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle();
    setState({ loading: false, error, value: data?.value ?? null, updatedAt: data?.updated_at ?? null });
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** Simpan (insert atau update) satu key. Hanya berhasil untuk HR. Mengembalikan error Supabase atau null. */
export async function saveCompanySetting(key, value) {
  const { error } = await supabase.from('company_settings').upsert({ key, value }, { onConflict: 'key' });
  return error ?? null;
}
