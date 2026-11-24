-- =====================================================================
-- HRIS Blue Rose Tech — migrasi: Pengaturan perusahaan (kontak bantuan)
-- Tabel company_settings (key/value jsonb) untuk halaman Bantuan:
--   hr_contact    = kontak HR yang dilihat karyawan di /app/bantuan
--   admin_contact = kontak admin sistem yang dilihat HR di /hr/bantuan
-- Struktur value kedua key: {"email": "...", "whatsapp": "62...", "hours": "..."}
-- RLS: semua user login boleh SELECT, hanya HR boleh INSERT/UPDATE, tidak ada DELETE.
-- Isi FAQ tidak disimpan di database (statis di dashboard/src/lib/helpContent.js).
-- =====================================================================

create table public.company_settings (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  -- Kontak wajib lengkap dan berformat benar, apa pun jalur penulisannya (UI atau query langsung).
  -- Regex email sengaja ketat (tanpa ? & spasi) karena dipakai langsung di link mailto:.
  constraint company_settings_contact_valid check (
    key not in ('hr_contact', 'admin_contact') or (
      jsonb_typeof(value) = 'object'
      and coalesce(value ->> 'email', '') ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
      and length(value ->> 'email') <= 254
      and coalesce(value ->> 'whatsapp', '') ~ '^62[1-9][0-9]{7,11}$'
      and length(trim(coalesce(value ->> 'hours', ''))) between 1 and 100
    )
  )
);

comment on table public.company_settings is
  'Pengaturan tingkat perusahaan (key/value). Dibaca semua user login, ditulis HR.';

create trigger set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hak akses + RLS. anon tidak dapat apa pun; authenticated tanpa DELETE.
-- ---------------------------------------------------------------------
revoke all on public.company_settings from anon, authenticated;
grant select, insert, update on public.company_settings to authenticated;

alter table public.company_settings enable row level security;

create policy "company_settings: user login baca" on public.company_settings
  for select to authenticated using (true);
create policy "company_settings: HR tambah" on public.company_settings
  for insert to authenticated with check (public.is_hr());
create policy "company_settings: HR ubah" on public.company_settings
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

-- ---------------------------------------------------------------------
-- Seed awal. Nilai contoh: ganti lewat Pengaturan > Kontak HR (hr_contact)
-- atau SQL (admin_contact). Tidak menimpa nilai yang sudah diubah.
-- ---------------------------------------------------------------------
insert into public.company_settings (key, value) values
  ('hr_contact', jsonb_build_object(
    'email', 'hr@bluerose.test',
    'whatsapp', '6281200000000',
    'hours', 'Senin-Jumat 08:30-17:30 WIB')),
  ('admin_contact', jsonb_build_object(
    'email', 'it@bluerose.test',
    'whatsapp', '6281200000001',
    'hours', 'Senin-Jumat 09:00-17:00 WIB'))
on conflict (key) do nothing;
