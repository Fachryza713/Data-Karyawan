-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 4: Pengaturan HR (kantor, shift, hari libur)
-- RPC hapus khusus HR. Tabel offices/shifts/holidays sudah ada sejak migrasi 1
-- dan tidak punya policy DELETE, jadi satu-satunya jalan menghapus adalah RPC ini.
-- Referensi: docs/PRD.md US-07, bagian 6.1
-- =====================================================================

-- ---------------------------------------------------------------------
-- hr_delete_office: tolak jika kantor masih dipakai karyawan.
-- Pesan error memuat jumlah karyawan; angka juga dikirim di DETAIL.
-- ---------------------------------------------------------------------
create or replace function public.hr_delete_office(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat menghapus kantor.' using errcode = '42501';
  end if;

  -- Kunci baris supaya tidak ada karyawan yang dipasang ke kantor ini di tengah proses.
  perform 1 from public.offices where id = p_id for update;
  if not found then
    raise exception 'Kantor tidak ditemukan.' using errcode = 'P0002';
  end if;

  select count(*) into v_used from public.profiles where office_id = p_id;
  if v_used > 0 then
    raise exception 'Kantor masih dipakai % karyawan. Pindahkan karyawan ke kantor lain terlebih dahulu.', v_used
      using errcode = '23503', detail = v_used::text;
  end if;

  delete from public.offices where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_delete_shift: tolak jika shift masih dipakai karyawan.
-- ---------------------------------------------------------------------
create or replace function public.hr_delete_shift(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat menghapus shift.' using errcode = '42501';
  end if;

  perform 1 from public.shifts where id = p_id for update;
  if not found then
    raise exception 'Shift tidak ditemukan.' using errcode = 'P0002';
  end if;

  select count(*) into v_used from public.profiles where shift_id = p_id;
  if v_used > 0 then
    raise exception 'Shift masih dipakai % karyawan. Pindahkan karyawan ke shift lain terlebih dahulu.', v_used
      using errcode = '23503', detail = v_used::text;
  end if;

  delete from public.shifts where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_delete_holiday: hapus satu hari libur.
-- ---------------------------------------------------------------------
create or replace function public.hr_delete_holiday(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat menghapus hari libur.' using errcode = '42501';
  end if;

  delete from public.holidays where id = p_id;
  if not found then
    raise exception 'Hari libur tidak ditemukan.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.hr_delete_office(uuid)  from public, anon;
revoke all on function public.hr_delete_shift(uuid)   from public, anon;
revoke all on function public.hr_delete_holiday(uuid) from public, anon;
grant execute on function public.hr_delete_office(uuid)  to authenticated;
grant execute on function public.hr_delete_shift(uuid)   to authenticated;
grant execute on function public.hr_delete_holiday(uuid) to authenticated;
