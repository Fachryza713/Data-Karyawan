-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 3: profil karyawan (self-service)
-- RPC update_my_profile, pengaman kolom organisasi, bucket Storage "avatars"
-- Referensi: docs/PRD.md US-12, bagian 7 (Storage buckets) dan 8
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hak UPDATE langsung pada profiles.
-- Sejak migrasi 1 hanya ada policy UPDATE untuk HR, jadi karyawan tidak bisa
-- mengubah profiles lewat PATCH /rest/v1/profiles. Policy itu ditulis ulang di sini
-- supaya aturannya eksplisit: satu-satunya jalan karyawan adalah RPC update_my_profile.
-- ---------------------------------------------------------------------
drop policy if exists "profiles: HR ubah" on public.profiles;
create policy "profiles: HR ubah" on public.profiles
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

-- Lapisan kedua: siapa pun selain HR (termasuk lewat fungsi security definer)
-- tidak boleh mengubah kolom organisasi.
create or replace function public.guard_profile_org_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_hr() or auth.uid() is null then
    return new; -- HR, atau proses server (SQL Editor / service role)
  end if;
  if new.nip               is distinct from old.nip
  or new.email             is distinct from old.email
  or new.role              is distinct from old.role
  or new.division_id       is distinct from old.division_id
  or new.position_id       is distinct from old.position_id
  or new.office_id         is distinct from old.office_id
  or new.shift_id          is distinct from old.shift_id
  or new.join_date         is distinct from old.join_date
  or new.employment_status is distinct from old.employment_status
  or new.is_active         is distinct from old.is_active then
    raise exception 'Data organisasi hanya dapat diubah oleh HR.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_org_fields before update on public.profiles
  for each row execute function public.guard_profile_org_fields();

-- ---------------------------------------------------------------------
-- RPC update_my_profile: karyawan mengubah data pribadinya sendiri.
-- Hanya: nama lengkap, telepon, jenis kelamin, tanggal lahir, foto.
-- ---------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_full_name  text,
  p_phone      text,
  p_gender     public.gender_type,
  p_birth_date date,
  p_photo_url  text
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := trim(coalesce(p_full_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_photo text := nullif(trim(coalesce(p_photo_url, '')), '');
  v_row   public.profiles;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan.' using errcode = '42501';
  end if;
  if length(v_name) = 0 or length(v_name) > 100 then
    raise exception 'Nama lengkap wajib diisi (maksimal 100 karakter).' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 -]{7,19}$' then
    raise exception 'Nomor telepon tidak valid.' using errcode = '22023';
  end if;
  if p_birth_date is not null and (p_birth_date >= current_date or p_birth_date < date '1900-01-01') then
    raise exception 'Tanggal lahir tidak valid.' using errcode = '22023';
  end if;
  -- Foto hanya boleh dari folder milik sendiri di bucket avatars.
  if v_photo is not null
     and v_photo not like '%/storage/v1/object/public/avatars/' || v_uid::text || '/avatar.%' then
    raise exception 'URL foto tidak valid.' using errcode = '22023';
  end if;

  update public.profiles
     set full_name  = v_name,
         phone      = v_phone,
         gender     = p_gender,
         birth_date = p_birth_date,
         photo_url  = v_photo
   where id = v_uid and is_active
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Profil tidak ditemukan atau akun nonaktif.' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

revoke all on function public.update_my_profile(text, text, public.gender_type, date, text) from public, anon;
grant execute on function public.update_my_profile(text, text, public.gender_type, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Storage bucket "avatars": publik dibaca, JPG/PNG maks 2 MB (ditegakkan oleh Storage).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path wajib <user_id>/avatar.(jpg|jpeg|png), dan hanya pemilik folder yang boleh menulis.
-- Baca publik lewat URL /object/public/avatars/... tidak butuh policy (bucket public = true).
-- Policy SELECT hanya untuk pemilik (dibutuhkan saat upsert), supaya isi bucket tidak bisa di-list orang lain.
create policy "avatars: pemilik baca" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: pemilik upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/avatar\.(jpg|jpeg|png)$'
  );

create policy "avatars: pemilik ganti" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/avatar\.(jpg|jpeg|png)$'
  );

create policy "avatars: pemilik hapus" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
