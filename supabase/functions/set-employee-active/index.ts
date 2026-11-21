// Edge Function set-employee-active (hanya HR).
// Nonaktifkan: ban user di Auth (tidak bisa login / refresh token) lalu profiles.is_active = false.
// Aktifkan kembali: kebalikannya. Riwayat data tidak dihapus.
import { corsHeaders, fail, json, requireHr } from '../_shared/hr.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = '876000h'; // ~100 tahun

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method', 'Metode tidak didukung.');

  const ctx = await requireHr(req);
  if (ctx instanceof Response) return ctx;
  const { user, userClient, admin } = ctx;

  let body: { employee_id?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'validation', 'Body request bukan JSON yang valid.');
  }

  const id = body.employee_id ?? '';
  if (!UUID_RE.test(id) || typeof body.active !== 'boolean') {
    return fail(400, 'validation', 'employee_id dan active wajib diisi.');
  }
  if (id === user.id && !body.active) {
    return fail(400, 'self', 'Anda tidak bisa menonaktifkan akun sendiri.');
  }

  const { data: target, error: findError } = await userClient
    .from('profiles')
    .select('id, is_active')
    .eq('id', id)
    .maybeSingle();
  if (findError) return fail(500, 'server', 'Gagal membaca data karyawan.');
  if (!target) return fail(404, 'not_found', 'Karyawan tidak ditemukan.');

  // 1. Ban / unban di Auth.
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: body.active ? 'none' : BAN_FOREVER,
  });
  if (banError) return fail(500, 'auth', `Gagal memperbarui akun Auth: ${banError.message}`);

  // 2. Update profil atas nama HR (tercatat di audit_logs). Gagal -> kembalikan status ban.
  const { error: updateError } = await userClient.from('profiles').update({ is_active: body.active }).eq('id', id);
  if (updateError) {
    await admin.auth.admin.updateUserById(id, { ban_duration: target.is_active ? 'none' : BAN_FOREVER });
    return fail(500, 'server', `Gagal memperbarui status karyawan: ${updateError.message}`);
  }

  return json(200, { id, active: body.active });
});
