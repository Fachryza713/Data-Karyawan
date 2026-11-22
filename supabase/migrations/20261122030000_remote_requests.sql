-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 8: Pengajuan WFH & dinas luar, terhubung ke absen
-- RPC submit_remote; has_approved_remote diisi; clock_in/clock_out mengisi mode wfh/dinas.
-- Tidak ada tabel baru (memakai public.requests dari migrasi 7).
-- Referensi: PRD US-04, bagian 6.1 butir 3, bagian 6.2
-- =====================================================================

-- ---------------------------------------------------------------------
-- requests: tujuan wajib untuk dinas luar, maksimal 200 karakter.
-- Baris lama aman: submit_leave tidak pernah mengisi destination dan belum ada baris dinas.
-- ---------------------------------------------------------------------
alter table public.requests
  add constraint requests_dinas_destination_check
    check (kind <> 'dinas' or (destination is not null and length(trim(destination)) > 0)),
  add constraint requests_destination_length_check
    check (destination is null or length(destination) <= 200);

create index if not exists requests_remote_approved_idx
  on public.requests (employee_id, start_date, end_date)
  where kind in ('wfh', 'dinas') and status = 'disetujui';

-- ---------------------------------------------------------------------
-- approved_remote_kind: 'wfh' / 'dinas' jika karyawan punya izin kerja di luar kantor
-- yang disetujui dan mencakup tanggal tsb, selain itu null.
-- Hanya dipanggil dari dalam RPC, tidak diekspos ke client.
-- ---------------------------------------------------------------------
create or replace function public.approved_remote_kind(p_employee_id uuid, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select r.kind
  from public.requests r
  where r.employee_id = p_employee_id
    and r.kind in ('wfh', 'dinas')
    and r.status = 'disetujui'
    and p_date between r.start_date and r.end_date
  order by r.reviewed_at desc nulls last, r.created_at desc
  limit 1;
$$;

revoke all on function public.approved_remote_kind(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- has_approved_remote: sebelumnya selalu false (migrasi 5). Sekarang membaca requests.
-- Dipakai _attendance_check_location untuk membuka absen di luar radius.
-- ---------------------------------------------------------------------
create or replace function public.has_approved_remote(p_employee_id uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.approved_remote_kind(p_employee_id, p_date) is not null;
$$;

revoke all on function public.has_approved_remote(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- submit_remote: ajukan WFH atau dinas luar.
-- Paling lambat H-1 (mulai minimal besok WIB), tidak tumpang tindih dengan pengajuan
-- lain yang menunggu/disetujui, tidak menyentuh leave_balances.
-- ---------------------------------------------------------------------
create or replace function public.submit_remote(
  p_kind text, p_start date, p_end date, p_reason text, p_destination text default null
)
returns public.requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := (now() at time zone 'Asia/Jakarta')::date;
  v_reason  text := nullif(trim(coalesce(p_reason, '')), '');
  v_dest    text := nullif(trim(coalesce(p_destination, '')), '');
  v_days    integer;
  v_row     public.requests;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'Akun tidak aktif.' using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('wfh', 'dinas') then
    raise exception 'Jenis pengajuan harus WFH atau dinas luar.' using errcode = '22023';
  end if;

  if p_start is null or p_end is null then
    raise exception 'Tanggal mulai dan selesai wajib diisi.' using errcode = '22023';
  end if;
  if p_start > p_end then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.' using errcode = '22023';
  end if;
  if p_start <= v_today then
    raise exception 'WFH dan dinas luar diajukan paling lambat H-1. Tanggal mulai minimal besok.'
      using errcode = 'P0001';
  end if;
  if p_end > v_today + 365 then
    raise exception 'Tanggal selesai paling jauh 1 tahun dari hari ini.' using errcode = '22023';
  end if;

  if v_reason is null then
    raise exception 'Alasan wajib diisi.' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Alasan maksimal 500 karakter.' using errcode = '22023';
  end if;

  if p_kind = 'dinas' then
    if v_dest is null then
      raise exception 'Lokasi tujuan wajib diisi untuk dinas luar.' using errcode = '22023';
    end if;
    if length(v_dest) > 200 then
      raise exception 'Lokasi tujuan maksimal 200 karakter.' using errcode = '22023';
    end if;
  else
    v_dest := null; -- WFH tidak punya lokasi tujuan
  end if;

  v_days := public.working_days(p_start, p_end);
  if v_days = 0 then
    raise exception 'Rentang tanggal tidak berisi hari kerja.' using errcode = 'P0001';
  end if;

  -- Kunci yang sama dengan submit_leave: cek tumpang tindih lintas jenis tidak bisa diakali klik ganda.
  perform pg_advisory_xact_lock(hashtextextended('requests:' || v_uid::text, 0));

  if exists (
    select 1 from public.requests r
    where r.employee_id = v_uid
      and r.status in ('menunggu', 'disetujui')
      and r.start_date <= p_end and r.end_date >= p_start
  ) then
    raise exception 'Tanggal ini bertumpang tindih dengan pengajuan lain yang menunggu atau disetujui.'
      using errcode = 'P0001';
  end if;

  insert into public.requests (employee_id, kind, start_date, end_date, working_days, reason, destination)
  values (v_uid, p_kind, p_start, p_end, v_days, v_reason, v_dest)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.submit_remote(text, date, date, text, text) from public, anon;
grant execute on function public.submit_remote(text, date, date, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- clock_in: sama dengan migrasi 5, kecuali mode diambil dari izin WFH/dinas yang disetujui.
-- Radius dilewati oleh _attendance_check_location (via has_approved_remote);
-- batas akurasi 100 m tetap berlaku; koordinat & jarak tetap disimpan.
-- ---------------------------------------------------------------------
create or replace function public.clock_in(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns public.attendances
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_now     timestamptz := now();
  v_local   timestamp := v_now at time zone 'Asia/Jakarta';
  v_date    date := v_local::date;
  v_time    time := v_local::time;
  v_loc     record;
  v_late    integer := 0;
  v_status  text;
  v_mode    text;
  v_exist   public.attendances;
  v_row     public.attendances;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;

  select * into v_exist from public.attendances where employee_id = v_uid and date = v_date;
  if found then
    if v_exist.clock_in_at is not null then
      raise exception 'Anda sudah absen masuk hari ini pukul %.',
        to_char(v_exist.clock_in_at at time zone 'Asia/Jakarta', 'HH24:MI') using errcode = 'P0001';
    end if;
    raise exception 'Kehadiran hari ini sudah tercatat sebagai %.', v_exist.status using errcode = 'P0001';
  end if;

  select * into v_loc from public._attendance_check_location(v_uid, v_date, p_lat, p_lng, p_accuracy);

  if v_time > v_loc.o_start_time + make_interval(mins => v_loc.o_tolerance_min) then
    v_status := 'terlambat';
    v_late := floor(extract(epoch from (v_time - v_loc.o_start_time)) / 60)::integer;
  else
    v_status := 'tepat_waktu';
  end if;

  -- Ada izin WFH/dinas disetujui untuk hari ini: mode mengikuti jenis pengajuan.
  v_mode := 'office';
  if v_loc.o_remote then
    v_mode := coalesce(public.approved_remote_kind(v_uid, v_date), 'office');
  end if;

  begin
    insert into public.attendances (
      employee_id, date, clock_in_at, clock_in_lat, clock_in_lng,
      clock_in_distance_m, clock_in_accuracy_m, mode, status, late_minutes
    ) values (
      v_uid, v_date, v_now, round(p_lat::numeric, 6), round(p_lng::numeric, 6),
      round(v_loc.o_distance_m)::integer, round(p_accuracy::numeric, 1), v_mode, v_status, v_late
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Anda sudah absen masuk hari ini.' using errcode = 'P0001';
  end;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- clock_out: sama dengan migrasi 5. Jika izin WFH/dinas berlaku hari ini, mode ikut
-- diisi sesuai pengajuan (mis. izin disetujui HR setelah karyawan absen masuk di kantor).
-- ---------------------------------------------------------------------
create or replace function public.clock_out(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns public.attendances
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_now    timestamptz := now();
  v_local  timestamp := v_now at time zone 'Asia/Jakarta';
  v_date   date := v_local::date;
  v_time   time := v_local::time;
  v_loc    record;
  v_mode   text;
  v_exist  public.attendances;
  v_row    public.attendances;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;

  -- Kunci baris hari ini agar dua klik bersamaan tidak sama-sama lolos.
  select * into v_exist from public.attendances
  where employee_id = v_uid and date = v_date
  for update;
  if not found or v_exist.clock_in_at is null then
    raise exception 'Anda belum absen masuk hari ini.' using errcode = 'P0001';
  end if;
  if v_exist.clock_out_at is not null then
    raise exception 'Anda sudah absen pulang hari ini pukul %.',
      to_char(v_exist.clock_out_at at time zone 'Asia/Jakarta', 'HH24:MI') using errcode = 'P0001';
  end if;

  select * into v_loc from public._attendance_check_location(v_uid, v_date, p_lat, p_lng, p_accuracy);

  v_mode := v_exist.mode;
  if v_loc.o_remote then
    v_mode := coalesce(public.approved_remote_kind(v_uid, v_date), v_exist.mode);
  end if;

  update public.attendances set
    clock_out_at         = v_now,
    clock_out_lat        = round(p_lat::numeric, 6),
    clock_out_lng        = round(p_lng::numeric, 6),
    clock_out_distance_m = round(v_loc.o_distance_m)::integer,
    clock_out_accuracy_m = round(p_accuracy::numeric, 1),
    mode                 = v_mode,
    -- late_minutes tetap tersimpan walau status berubah jadi pulang_cepat.
    status = case when v_time < v_loc.o_end_time then 'pulang_cepat' else status end
  where id = v_exist.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.clock_in(double precision, double precision, double precision)  from public, anon;
revoke all on function public.clock_out(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in(double precision, double precision, double precision)  to authenticated;
grant execute on function public.clock_out(double precision, double precision, double precision) to authenticated;
