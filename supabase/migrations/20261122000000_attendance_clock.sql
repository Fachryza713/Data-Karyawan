-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 5: Presensi GPS (absen masuk/pulang)
-- Tabel attendances + haversine_m + has_approved_remote + RPC clock_in/clock_out.
-- Client hanya boleh SELECT; semua penulisan lewat RPC security definer.
-- Referensi: PRD US-03, bagian 6.1, bagian 7
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabel attendances: satu baris per karyawan per tanggal (WIB).
-- clock_in_at boleh null untuk baris cuti/sakit/izin/alpa (diisi modul lain).
-- ---------------------------------------------------------------------
create table public.attendances (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references public.profiles (id) on delete cascade,
  date                   date not null,
  clock_in_at            timestamptz,
  clock_in_lat           numeric(9, 6),
  clock_in_lng           numeric(9, 6),
  clock_in_distance_m    integer check (clock_in_distance_m >= 0),
  clock_in_accuracy_m    numeric(8, 1) check (clock_in_accuracy_m >= 0),
  clock_out_at           timestamptz,
  clock_out_lat          numeric(9, 6),
  clock_out_lng          numeric(9, 6),
  clock_out_distance_m   integer check (clock_out_distance_m >= 0),
  clock_out_accuracy_m   numeric(8, 1) check (clock_out_accuracy_m >= 0),
  mode                   text check (mode in ('office', 'wfh', 'dinas')),
  status                 text not null check (status in (
                           'tepat_waktu', 'terlambat', 'pulang_cepat', 'cuti', 'sakit', 'izin', 'alpa')),
  late_minutes           integer not null default 0 check (late_minutes >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (employee_id, date),
  check (clock_out_at is null or (clock_in_at is not null and clock_out_at >= clock_in_at))
);
create index attendances_date_idx on public.attendances (date);

create trigger set_updated_at before update on public.attendances
  for each row execute function public.set_updated_at();

-- Hanya SELECT untuk client. Tidak ada insert/update/delete langsung.
revoke all on public.attendances from anon, authenticated;
grant select on public.attendances to authenticated;

alter table public.attendances enable row level security;

create policy "attendances: karyawan baca miliknya" on public.attendances
  for select to authenticated using (employee_id = auth.uid());
create policy "attendances: HR baca semua" on public.attendances
  for select to authenticated using (public.is_hr());

-- ---------------------------------------------------------------------
-- haversine_m: jarak dua titik (derajat) dalam meter. Radius bumi 6.371 km.
-- ---------------------------------------------------------------------
create or replace function public.haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  -- least(1, ...) mencegah asin() error akibat pembulatan float untuk titik yang berseberangan.
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

revoke all on function public.haversine_m(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.haversine_m(double precision, double precision, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------
-- has_approved_remote: apakah karyawan punya izin WFH/dinas yang disetujui
-- pada tanggal tsb. SEMENTARA selalu false; diisi di prompt WFH/dinas.
-- Hanya dipanggil dari dalam RPC, tidak diekspos ke client.
-- ---------------------------------------------------------------------
create or replace function public.has_approved_remote(p_employee_id uuid, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select false;
$$;

revoke all on function public.has_approved_remote(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper internal: validasi input GPS, ambil kantor/shift karyawan, hitung jarak,
-- dan tolak jika di luar radius tanpa izin kerja di luar kantor.
-- ---------------------------------------------------------------------
create or replace function public._attendance_check_location(
  p_uid uuid, p_date date,
  p_lat double precision, p_lng double precision, p_accuracy double precision,
  out o_distance_m double precision,
  out o_remote boolean,
  out o_start_time time,
  out o_end_time time,
  out o_tolerance_min integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active    boolean;
  v_office    record;
  v_shift_id  uuid;
begin
  if p_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Koordinat lokasi tidak valid.' using errcode = '22023';
  end if;
  if p_accuracy is null or p_accuracy < 0 then
    raise exception 'Akurasi GPS tidak terbaca. Coba lagi.' using errcode = '22023';
  end if;
  if p_accuracy > 100 then
    raise exception 'Akurasi GPS terlalu rendah (% m, maksimal 100 m). Coba lagi di tempat terbuka.', round(p_accuracy)
      using errcode = 'P0001', hint = round(p_accuracy)::text;
  end if;

  select p.is_active, p.shift_id into v_active, v_shift_id
  from public.profiles p where p.id = p_uid;
  if not found or not v_active then
    raise exception 'Akun tidak aktif.' using errcode = '42501';
  end if;

  select o.name, o.latitude, o.longitude, o.radius_m into v_office
  from public.profiles p join public.offices o on o.id = p.office_id
  where p.id = p_uid;
  if not found then
    raise exception 'Kantor Anda belum diatur. Hubungi HR.' using errcode = 'P0001';
  end if;

  select s.start_time, s.end_time, s.late_tolerance_min into o_start_time, o_end_time, o_tolerance_min
  from public.shifts s where s.id = v_shift_id;
  if not found then
    raise exception 'Shift Anda belum diatur. Hubungi HR.' using errcode = 'P0001';
  end if;

  o_distance_m := public.haversine_m(p_lat, p_lng, v_office.latitude::double precision, v_office.longitude::double precision);
  o_remote := public.has_approved_remote(p_uid, p_date);

  if not o_remote and o_distance_m > v_office.radius_m then
    raise exception 'Absen hanya bisa dilakukan di dalam radius kantor. Jarak Anda saat ini % m dari % (radius % m).',
      round(o_distance_m), v_office.name, v_office.radius_m
      using errcode = 'P0001', hint = round(o_distance_m)::text;
  end if;
end;
$$;

revoke all on function public._attendance_check_location(uuid, date, double precision, double precision, double precision)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- clock_in: absen masuk. Tanggal & jam dihitung di Asia/Jakarta.
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

  -- Selama has_approved_remote() masih false, mode selalu 'office'.
  -- Prompt WFH/dinas akan menentukan 'wfh' / 'dinas' dari pengajuan yang disetujui.
  v_mode := 'office';

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
-- clock_out: absen pulang. Sebelum jam pulang shift = pulang_cepat.
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

  update public.attendances set
    clock_out_at         = v_now,
    clock_out_lat        = round(p_lat::numeric, 6),
    clock_out_lng        = round(p_lng::numeric, 6),
    clock_out_distance_m = round(v_loc.o_distance_m)::integer,
    clock_out_accuracy_m = round(p_accuracy::numeric, 1),
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
