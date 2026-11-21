// Edge Function invite-employee (hanya HR).
// Alur: validasi -> cek NIP/email unik -> buat user Auth (undangan email) -> RPC hr_create_employee
// (profiles + salary_components + benefits dalam satu transaksi). Jika RPC gagal, user Auth dihapus lagi.
import { corsHeaders, fail, json, requireHr } from '../_shared/hr.ts';

const NIP_RE = /^BRT-\d{4}-\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Payload = Record<string, unknown>;

/** Validasi payload. Mengembalikan [field, pesan] untuk error pertama, atau null. */
function validate(d: Payload): [string, string] | null {
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string).trim() : '');
  if (!s('full_name')) return ['full_name', 'Nama wajib diisi.'];
  if (!EMAIL_RE.test(s('email'))) return ['email', 'Format email tidak valid.'];
  if (!NIP_RE.test(s('nip').toUpperCase())) return ['nip', 'NIP harus berformat BRT-YYYY-NNNN.'];
  if (!['laki_laki', 'perempuan'].includes(s('gender'))) return ['gender', 'Pilih jenis kelamin.'];
  if (s('birth_date') && !DATE_RE.test(s('birth_date'))) return ['birth_date', 'Tanggal lahir tidak valid.'];
  for (const k of ['division_id', 'position_id', 'office_id', 'shift_id']) {
    if (!UUID_RE.test(s(k))) return [k, 'Wajib dipilih.'];
  }
  if (!DATE_RE.test(s('join_date'))) return ['join_date', 'Tanggal masuk wajib diisi.'];
  if (!['tetap', 'kontrak'].includes(s('employment_status'))) return ['employment_status', 'Pilih status karyawan.'];
  const base = Number(d.base_salary);
  if (!Number.isFinite(base) || base <= 0) return ['base_salary', 'Gaji pokok wajib diisi.'];
  const allowance = Number(d.fixed_allowance ?? 0);
  if (!Number.isFinite(allowance) || allowance < 0) return ['fixed_allowance', 'Tunjangan tidak valid.'];
  if (!s('bank_name')) return ['bank_name', 'Nama bank wajib diisi.'];
  if (!/^\d{4}$/.test(s('bank_account_last4'))) return ['bank_account_last4', 'Isi tepat 4 digit terakhir rekening.'];
  if (s('bpjs_kes_no') && !/^\d{13}$/.test(s('bpjs_kes_no'))) return ['bpjs_kes_no', 'Nomor BPJS Kesehatan 13 digit.'];
  if (s('bpjs_tk_no') && !/^\d{11}$/.test(s('bpjs_tk_no'))) return ['bpjs_tk_no', 'Nomor BPJS Ketenagakerjaan 11 digit.'];
  return null;
}

/** Tentukan field dari pelanggaran unique constraint Postgres (23505). */
function uniqueField(message = ''): string | null {
  if (message.includes('profiles_nip_key')) return 'nip';
  if (message.includes('profiles_email_key')) return 'email';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'method', 'Metode tidak didukung.');

  const ctx = await requireHr(req);
  if (ctx instanceof Response) return ctx;
  const { userClient, admin } = ctx;

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'validation', 'Body request bukan JSON yang valid.');
  }

  const invalid = validate(body);
  if (invalid) return fail(400, 'validation', invalid[1], invalid[0]);

  const email = String(body.email).trim().toLowerCase();
  const nip = String(body.nip).trim().toUpperCase();
  const fullName = String(body.full_name).trim();
  const sendInvite = body.send_invite !== false;

  // 1. Cek unik lebih awal supaya user Auth tidak terbuat sia-sia.
  const { data: dupes, error: dupeError } = await userClient
    .from('profiles')
    .select('nip, email')
    .or(`nip.eq.${nip},email.eq.${email}`);
  if (dupeError) return fail(500, 'server', 'Gagal memeriksa data karyawan.');
  if (dupes?.some((r) => r.nip === nip)) return fail(409, 'duplicate', 'NIP sudah dipakai karyawan lain.', 'nip');
  if (dupes?.some((r) => r.email === email)) return fail(409, 'duplicate', 'Email sudah terdaftar.', 'email');

  // 2. Buat user Auth.
  const origin = req.headers.get('origin') ?? '';
  const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : `${origin}/update-password`;
  const metadata = { full_name: fullName };

  const created = sendInvite
    ? await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: metadata })
    : await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });

  if (created.error || !created.data.user) {
    const err = created.error;
    const msg = err?.message ?? '';
    if (err?.code === 'email_exists' || /already (been )?registered/i.test(msg)) {
      return fail(409, 'duplicate', 'Email sudah terdaftar di Auth.', 'email');
    }
    if (sendInvite && /sending|smtp|email/i.test(msg)) {
      return fail(
        502,
        'email_send',
        'Email undangan gagal dikirim. SMTP bawaan Supabase hanya mengirim ke email anggota tim project. ' +
          'Atur SMTP custom, atau matikan opsi "Kirim email undangan".',
      );
    }
    return fail(500, 'auth', `Gagal membuat akun: ${msg || 'kesalahan tidak diketahui'}`);
  }

  const userId = created.data.user.id;

  // 3. Simpan data karyawan (atomik). Gagal -> hapus user Auth supaya tidak ada akun yatim.
  const { error: rpcError } = await userClient.rpc('hr_create_employee', {
    p_user_id: userId,
    p_data: { ...body, email, nip, full_name: fullName },
  });

  if (rpcError) {
    await admin.auth.admin.deleteUser(userId);
    const field = rpcError.code === '23505' ? uniqueField(rpcError.message) : null;
    if (field) {
      return fail(409, 'duplicate', field === 'nip' ? 'NIP sudah dipakai karyawan lain.' : 'Email sudah terdaftar.', field);
    }
    if (rpcError.code === '23514' || rpcError.code === '22P02' || rpcError.code === '23503') {
      return fail(400, 'validation', rpcError.message);
    }
    return fail(500, 'server', `Gagal menyimpan data karyawan: ${rpcError.message}`);
  }

  return json(201, { id: userId, invited: sendInvite });
});
