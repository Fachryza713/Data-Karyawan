-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 6: Riwayat & log presensi, penandaan alpa
-- RPC hr_attendance_log + hr_attendance_summary (khusus HR), mark_absent() + pg_cron.
-- Tidak ada tabel baru. Referensi: PRD US-05, US-06, bagian 6.1 butir 7
-- =====================================================================

-- ---------------------------------------------------------------------
-- hr_attendance_log: satu baris per karyawan per tanggal dalam rentang,
-- termasuk yang belum absen. log_status adalah kategori filter HR:
--   tepat_waktu | terlambat | cuti_sakit | luar_radius | belum_absen | alpa
-- "luar_radius" = absen diterima di luar radius kantor (mode wfh/dinas).
-- Absen di luar radius tanpa izin ditolak clock_in sehingga tidak pernah tersimpan.
-- ---------------------------------------------------------------------
create or replace function public.hr_attendance_log(p_from date, p_to date)
returns table (
  employee_id           uuid,
  full_name             text,
  nip                   text,
  division_id           uuid,
  division_name         text,
  position_name         text,
  office_name           text,
  date                  date,
  is_workday            boolean,
  attendance_id         uuid,
  clock_in_at           timestamptz,
  clock_in_lat          numeric,
  clock_in_lng          numeric,
  clock_in_distance_m   integer,
  clock_in_accuracy_m   numeric,
  clock_out_at          timestamptz,
  clock_out_lat         numeric,
  clock_out_lng         numeric,
  clock_out_distance_m  integer,
  clock_out_accuracy_m  numeric,
  mode                  text,
  status                text,
  late_minutes          integer,
  log_status            text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat melihat log presensi.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  if p_to - p_from > 92 then
    raise exception 'Rentang tanggal maksimal 93 hari.' using errcode = '22023';
  end if;

  return query
  select
    p.id, p.full_name, p.nip, p.division_id, dv.name, ps.name, o.name,
    g.d::date,
    (extract(isodow from g.d) < 6 and h.id is null),
    a.id,
    a.clock_in_at, a.clock_in_lat, a.clock_in_lng, a.clock_in_distance_m, a.clock_in_accuracy_m,
    a.clock_out_at, a.clock_out_lat, a.clock_out_lng, a.clock_out_distance_m, a.clock_out_accuracy_m,
    a.mode, a.status, a.late_minutes,
    case
      when a.id is null then 'belum_absen'
      when a.status in ('cuti', 'sakit', 'izin') then 'cuti_sakit'
      when a.status = 'alpa' then 'alpa'
      when a.mode in ('wfh', 'dinas') then 'luar_radius'
      when a.late_minutes > 0 then 'terlambat'
      else 'tepat_waktu'
    end
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(d)
  cross join public.profiles p
  left join public.divisions dv on dv.id = p.division_id
  left join public.positions ps on ps.id = p.position_id
  left join public.offices o on o.id = p.office_id
  left join public.holidays h on h.date = g.d::date
  left join public.attendances a on a.employee_id = p.id and a.date = g.d::date
  where p.role = 'employee'
    -- karyawan nonaktif tetap muncul pada tanggal yang punya catatan (untuk ekspor historis)
    and (p.is_active or a.id is not null)
    and (p.join_date is null or p.join_date <= g.d::date)
  order by g.d, p.full_name;
end;
$$;

revoke all on function public.hr_attendance_log(date, date) from public, anon;
grant execute on function public.hr_attendance_log(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- hr_attendance_summary: jumlah per kategori untuk satu tanggal.
-- Memakai hr_attendance_log, jadi pengecekan HR ikut berlaku.
-- ---------------------------------------------------------------------
create or replace function public.hr_attendance_summary(p_date date)
returns table (
  total             integer,
  tepat_waktu       integer,
  terlambat         integer,
  cuti_sakit        integer,
  luar_radius       integer,
  belum_absen       integer,
  alpa              integer,
  pulang_cepat      integer,
  avg_late_minutes  integer
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    count(*) filter (where l.log_status = 'tepat_waktu')::integer,
    count(*) filter (where l.log_status = 'terlambat')::integer,
    count(*) filter (where l.log_status = 'cuti_sakit')::integer,
    count(*) filter (where l.log_status = 'luar_radius')::integer,
    count(*) filter (where l.log_status = 'belum_absen')::integer,
    count(*) filter (where l.log_status = 'alpa')::integer,
    count(*) filter (where l.status = 'pulang_cepat')::integer,
    round(avg(l.late_minutes) filter (where l.late_minutes > 0))::integer
  from public.hr_attendance_log(p_date, p_date) l;
$$;

revoke all on function public.hr_attendance_summary(date) from public, anon;
grant execute on function public.hr_attendance_summary(date) to authenticated;

-- ---------------------------------------------------------------------
-- mark_absent: tandai 'alpa' karyawan aktif yang tidak punya baris attendances
-- pada hari kerja (bukan Sabtu/Minggu, bukan tanggal di holidays).
-- Default tanggal = hari ini WIB. Hanya untuk pg_cron / admin, tidak untuk client.
-- ---------------------------------------------------------------------
create or replace function public.mark_absent(p_date date default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_date  date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  v_count integer;
begin
  if extract(isodow from v_date) >= 6 then
    return 0;
  end if;
  if exists (select 1 from public.holidays h where h.date = v_date) then
    return 0;
  end if;

  insert into public.attendances (employee_id, date, status)
  select p.id, v_date, 'alpa'
  from public.profiles p
  where p.role = 'employee'
    and p.is_active
    and (p.join_date is null or p.join_date <= v_date)
    and not exists (
      select 1 from public.attendances a where a.employee_id = p.id and a.date = v_date
    )
  on conflict (employee_id, date) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_absent(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- pg_cron: jalankan mark_absent() setiap hari 23:59 WIB = 16:59 UTC.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'mark-absent-daily') then
    perform cron.unschedule('mark-absent-daily');
  end if;
  perform cron.schedule('mark-absent-daily', '59 16 * * *', 'select public.mark_absent();');
end;
$$;
