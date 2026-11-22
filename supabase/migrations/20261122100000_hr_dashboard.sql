-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 15: Beranda HR dengan data asli
-- RPC (khusus HR):
--   hr_dashboard()        semua angka beranda HR dalam satu panggilan.
--   hr_monthly_report()   rekap bulan berjalan per karyawan untuk CSV "Laporan bulanan".
-- Tidak ada tabel baru. Referensi: PRD US-20
-- =====================================================================

-- ---------------------------------------------------------------------
-- hr_dashboard: semua tanggal dihitung di Asia/Jakarta.
--   employees         jumlah profil aktif, divisi, jabatan
--   attendance        hr_attendance_summary(hari ini): kategori sama dengan log presensi HR
--   outside_radius    presensi hari ini yang jaraknya melebihi radius kantor (nama, jarak)
--   pending_requests  pengajuan menunggu yang bisa diproses HR ini (milik sendiri tidak dihitung,
--                     sama dengan badge sidebar) + tanggal mulai terdekat
--   payroll           run bulan berjalan (status, jumlah slip, total) + jumlah karyawan yang
--                     memenuhi syarat dihitung (aktif, sudah bergabung, punya komponen gaji)
--   kpi               periode aktif (atau periode selesai terbaru bila tidak ada yang aktif):
--                     total penilaian, final, draft tersimpan, rata-rata skor final, tenggat
-- ---------------------------------------------------------------------
create or replace function public.hr_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_local      timestamp := now() at time zone 'Asia/Jakarta';
  v_today      date := (now() at time zone 'Asia/Jakarta')::date;
  v_period     text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM');
  v_month_end  date := (date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '1 month - 1 day')::date;
  v_att        jsonb;
  v_kpi        public.kpi_periods;
begin
  if v_uid is null or not public.is_hr() then
    raise exception 'Hanya HR yang dapat melihat beranda HR.' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_att from public.hr_attendance_summary(v_today) s;

  select * into v_kpi from public.kpi_periods
  where status in ('aktif', 'selesai')
  order by (status = 'aktif') desc, start_date desc
  limit 1;

  return jsonb_build_object(
    'today', v_today,
    'now', v_local,
    'is_workday', extract(isodow from v_today) < 6
                  and not exists (select 1 from public.holidays h where h.date = v_today),

    'employees', jsonb_build_object(
      'active',    (select count(*) from public.profiles p where p.is_active),
      'divisions', (select count(*) from public.divisions),
      'positions', (select count(*) from public.positions)),

    'attendance', v_att,

    'outside_radius', coalesce((
      select jsonb_agg(x order by x.distance_m desc)
      from (
        select p.full_name as name, a.mode, o.name as office, o.radius_m,
               greatest(coalesce(a.clock_in_distance_m, 0), coalesce(a.clock_out_distance_m, 0)) as distance_m
        from public.attendances a
        join public.profiles p on p.id = a.employee_id
        join public.offices o on o.id = p.office_id
        where a.date = v_today
          and a.clock_in_at is not null
          and greatest(coalesce(a.clock_in_distance_m, 0), coalesce(a.clock_out_distance_m, 0)) > o.radius_m
      ) x), '[]'::jsonb),

    'pending_requests', (
      select jsonb_build_object(
               'count', count(*),
               'leave', count(*) filter (where r.kind = 'leave'),
               'remote', count(*) filter (where r.kind <> 'leave'),
               'nearest_start', min(r.start_date),
               'nearest_name', (
                 select p.full_name
                 from public.requests r2 join public.profiles p on p.id = r2.employee_id
                 where r2.status = 'menunggu' and r2.employee_id <> v_uid
                 order by r2.start_date, r2.created_at
                 limit 1))
      from public.requests r
      where r.status = 'menunggu' and r.employee_id <> v_uid),

    'payroll', jsonb_build_object(
      'period', v_period,
      'period_end', v_month_end,
      'eligible', (
        select count(*) from public.profiles p
        where p.is_active and (p.join_date is null or p.join_date <= v_month_end)
          and exists (select 1 from public.salary_components c
                      where c.employee_id = p.id and c.effective_from <= v_month_end)),
      'run', (
        select jsonb_build_object('id', r.id, 'status', r.status, 'employee_count', count(ps.id),
                 'total_gross', coalesce(sum(ps.gross), 0), 'total_net', coalesce(sum(ps.net), 0),
                 'finalized_at', r.finalized_at, 'paid_at', r.paid_at)
        from public.payroll_runs r
        left join public.payslips ps on ps.run_id = r.id
        where r.period = v_period
        group by r.id)),

    'kpi', case when v_kpi.id is null then null else (
      select jsonb_build_object(
               'period_id', v_kpi.id, 'name', v_kpi.name, 'status', v_kpi.status,
               'deadline', v_kpi.deadline, 'closed_at', v_kpi.closed_at,
               'total', count(*),
               'done', count(*) filter (where k.status = 'final'),
               'draft', count(*) filter (where k.status = 'draft' and k.reviewer_id is not null),
               'average', round(avg(k.final_score) filter (where k.status = 'final'), 1))
      from public.kpi_reviews k where k.period_id = v_kpi.id) end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- hr_monthly_report: satu baris per karyawan untuk periode 'YYYY-MM' (default bulan berjalan WIB).
-- Kehadiran: hadir (ada absen masuk), terlambat (masuk dengan late_minutes > 0), cuti,
-- sakit/izin, alpa. Payroll: status run + bruto & neto slip karyawan pada periode itu.
-- Karyawan: role employee yang aktif dan sudah bergabung, ditambah siapa pun yang punya
-- catatan presensi atau slip pada periode itu (mis. sudah nonaktif, atau HR yang digaji).
-- ---------------------------------------------------------------------
create or replace function public.hr_monthly_report(p_period text default null)
returns table (
  nip             text,
  full_name       text,
  division_name   text,
  position_name   text,
  hadir           integer,
  terlambat       integer,
  cuti            integer,
  sakit_izin      integer,
  alpa            integer,
  payroll_status  text,
  gross           numeric,
  net             numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_period  text := coalesce(p_period, to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'));
  v_start   date;
  v_end     date;
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat mengunduh laporan bulanan.' using errcode = '42501';
  end if;
  if v_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Periode harus berformat YYYY-MM.' using errcode = '22023';
  end if;
  v_start := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_end   := (v_start + interval '1 month - 1 day')::date;

  return query
  with att as (
    select a.employee_id,
           count(*) filter (where a.clock_in_at is not null)::integer                         as n_hadir,
           count(*) filter (where a.clock_in_at is not null and a.late_minutes > 0)::integer  as n_terlambat,
           count(*) filter (where a.status = 'cuti')::integer                                 as n_cuti,
           count(*) filter (where a.status in ('sakit', 'izin'))::integer                     as n_sakit_izin,
           count(*) filter (where a.status = 'alpa')::integer                                 as n_alpa
    from public.attendances a
    where a.date between v_start and v_end
    group by a.employee_id
  ),
  slip as (
    select ps.employee_id, r.status as run_status, ps.gross as slip_gross, ps.net as slip_net
    from public.payslips ps
    join public.payroll_runs r on r.id = ps.run_id
    where r.period = v_period
  )
  select p.nip, p.full_name, dv.name, pos.name,
         coalesce(att.n_hadir, 0), coalesce(att.n_terlambat, 0), coalesce(att.n_cuti, 0),
         coalesce(att.n_sakit_izin, 0), coalesce(att.n_alpa, 0),
         slip.run_status, slip.slip_gross, slip.slip_net
  from public.profiles p
  left join att on att.employee_id = p.id
  left join slip on slip.employee_id = p.id
  left join public.divisions dv on dv.id = p.division_id
  left join public.positions pos on pos.id = p.position_id
  where (p.role = 'employee' and p.is_active and (p.join_date is null or p.join_date <= v_end))
     or att.employee_id is not null
     or slip.employee_id is not null
  order by p.full_name;
end;
$$;

revoke all on function public.hr_dashboard()             from public, anon;
revoke all on function public.hr_monthly_report(text)    from public, anon;
grant execute on function public.hr_dashboard()          to authenticated;
grant execute on function public.hr_monthly_report(text) to authenticated;
