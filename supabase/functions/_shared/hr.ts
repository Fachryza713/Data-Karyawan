// Helper bersama Edge Function HR: CORS, respons JSON, dan verifikasi pemanggil = HR aktif.
// service_role key hanya dipakai di sini (server), tidak pernah dikirim ke browser.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Error dengan kode yang dipahami frontend, plus field form yang bermasalah (opsional). */
export const fail = (status: number, code: string, message: string, field?: string) =>
  json(status, { error: { code, message, field } });

function env(name: string, ...fallbacks: string[]): string {
  for (const n of [name, ...fallbacks]) {
    const v = Deno.env.get(n);
    if (v) return v;
  }
  throw new Error(`Environment variable ${name} tidak tersedia di Edge Function.`);
}

export interface HrContext {
  user: User;
  /** Client atas nama HR pemanggil: RLS berlaku dan auth.uid() = HR (untuk audit log). */
  userClient: SupabaseClient;
  /** Client service role, hanya untuk Auth Admin API. */
  admin: SupabaseClient;
}

/** Validasi JWT pemanggil dan pastikan role HR aktif. Mengembalikan Response jika ditolak. */
export async function requireHr(req: Request): Promise<HrContext | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return fail(401, 'unauthorized', 'Sesi tidak ditemukan. Silakan masuk ulang.');

  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.slice(7));
  if (userError || !userData.user) return fail(401, 'unauthorized', 'Sesi tidak valid. Silakan masuk ulang.');

  const { data: isHr, error: hrError } = await userClient.rpc('is_hr');
  if (hrError) return fail(500, 'server', 'Gagal memeriksa hak akses.');
  if (!isHr) return fail(403, 'forbidden', 'Hanya HR yang boleh melakukan tindakan ini.');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { user: userData.user, userClient, admin };
}
