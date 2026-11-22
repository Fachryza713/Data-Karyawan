-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 14: Beranda karyawan dalam satu panggilan
-- RPC my_dashboard(): semua data beranda milik karyawan login (presensi hari ini,
-- kantor & shift, izin remote hari ini, rekap presensi bulan ini, sisa cuti, pengajuan
-- menunggu, slip terakhir, manfaat, hasil KPI terakhir). Tidak ada tabel baru.
-- Security definer karena sebagian data (mis. run payroll draft) disembunyikan RLS dari
-- karyawan; setiap subquery dibatasi employee_id = auth.uid() dan tidak membuka nominal
-- slip yang belum terbit maupun penilaian KPI yang belum final.
-- Referensi: PRD US-19
-- =====================================================================

create or replace function public.my_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_today        date := (now() at time zone 'Asia/Jakarta')::date;
  v_month_start  date := date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date;
  v_month_end    date := (date_trunc('month', (now() at time zone 'Asia/Jakarta')) + interval '1 month - 1 day')::date;
  v_year         integer := extract(year from (now() at time zone 'Asia/Jakarta'))::integer;
  v_profile      public.profiles;
  v_slip         jsonb;
  v_slip_period  text;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profil tidak ditemukan.' using errcode = 'P0002';
  end if;

  -- Slip terakhir yang sudah terbit (final/paid).
  select jsonb_build_object(
           'period', r.period, 'status', r.status, 'net', s.net,
           'bank_name', s.bank_name, 'bank_account_last4', s.bank_account_last4,
           'finalized_at', r.finalized_at, 'paid_at', r.paid_at),
         r.period
    into v_slip, v_slip_period
  from public.payslips s
  join public.payroll_runs r on r.id = s.run_id
  where s.employee_id = v_uid and r.status in ('final', 'paid')
  order by r.period desc
  limit 1;

  return jsonb_build_object(
    'today', v_today,

    'office', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'radius_m', o.radius_m)
      from public.offices o where o.id = v_profile.office_id),

    'shift', (
      select jsonb_build_object('id', sh.id, 'name', sh.name, 'start_time', sh.start_time,
               'end_time', sh.end_time, 'late_tolerance_min', sh.late_tolerance_min)
      from public.shifts sh where sh.id = v_profile.shift_id),

    'attendance', (
      select jsonb_build_object('id', a.id, 'date', a.date, 'clock_in_at', a.clock_in_at,
               'clock_out_at', a.clock_out_at, 'clock_in_distance_m', a.clock_in_distance_m,
               'clock_out_distance_m', a.clock_out_distance_m, 'status', a.status,
               'late_minutes', a.late_minutes, 'mode', a.mode)
      from public.attendances a where a.employee_id = v_uid and a.date = v_today),

    -- Izin WFH/dinas disetujui yang mencakup hari ini (urutan sama dengan approved_remote_kind).
    'remote', (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'destination', r.destination,
               'start_date', r.start_date, 'end_date', r.end_date)
      from public.requests r
      where r.employee_id = v_uid and r.kind in ('wfh', 'dinas') and r.status = 'disetujui'
        and r.start_date <= v_today and r.end_date >= v_today
      order by r.reviewed_at desc nulls last, r.created_at desc
      limit 1),

    -- Rekap bulan berjalan (WIB). Hari kerja tersisa: besok s.d. akhir bulan, tanpa akhir pekan & libur.
    'month', (
      select jsonb_build_object(
               'period', to_char(v_month_start, 'YYYY-MM'),
               'hadir', count(*) filter (where a.clock_in_at is not null),
               'terlambat', count(*) filter (where a.clock_in_at is not null and a.late_minutes > 0),
               'cuti_izin', count(*) filter (where a.status in ('cuti', 'sakit', 'izin')),
               'hari_kerja_tersisa', public.working_days(v_today + 1, v_month_end))
      from public.attendances a
      where a.employee_id = v_uid and a.date between v_month_start and v_month_end),

    -- Cuti tahunan tahun berjalan. Tanpa baris saldo, kuota = kuota default jenis cuti tahunan
    -- (sama dengan yang dibuat ensure_leave_balance). pending_days = hari kerja pengajuan menunggu.
    'leave', (
      select jsonb_build_object('year', v_year, 'quota', q.quota, 'used', q.used, 'pending_days', q.pending,
               'remaining', q.quota - q.used, 'available', greatest(q.quota - q.used - q.pending, 0))
      from (
        select coalesce(b.quota, lt.annual_quota, 0) as quota,
               coalesce(b.used, 0) as used,
               (select coalesce(sum(r.working_days), 0)::integer
                from public.requests r
                where r.employee_id = v_uid and r.status = 'menunggu' and r.leave_type_id = lt.id
                  and r.start_date between make_date(v_year, 1, 1) and make_date(v_year, 12, 31)) as pending
        from public.leave_types lt
        left join public.leave_balances b on b.employee_id = v_uid and b.year = v_year
        where lt.code = 'tahunan'
        limit 1
      ) q),

    'pending_requests', (
      select count(*) from public.requests r where r.employee_id = v_uid and r.status = 'menunggu'),

    'payslip', v_slip,
    -- Periode lebih baru yang slipnya masih diproses HR (tanpa nominal).
    'payslip_processing', (
      select max(r.period)
      from public.payslips s
      join public.payroll_runs r on r.id = s.run_id
      where s.employee_id = v_uid and r.status = 'draft'
        and (v_slip_period is null or r.period > v_slip_period)),

    'benefits', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'provider', b.provider, 'program', b.program,
               'card_no', b.card_no, 'class', b.class, 'dependents', b.dependents, 'status', b.status)
             order by b.provider)
      from public.benefits b where b.employee_id = v_uid), '[]'::jsonb),
    'benefits_active', (
      select count(*) from public.benefits b where b.employee_id = v_uid and b.status = 'aktif'),

    -- Hasil KPI final terakhir.
    'kpi', (
      select jsonb_build_object('period_name', p.name, 'final_score', k.final_score, 'grade', k.grade,
               'finalized_at', k.finalized_at)
      from public.kpi_reviews k
      join public.kpi_periods p on p.id = k.period_id
      where k.employee_id = v_uid and k.status = 'final'
      order by p.start_date desc
      limit 1),
    'kpi_active_period', (
      select jsonb_build_object('name', p.name, 'deadline', p.deadline,
               'finalized', exists (
                 select 1 from public.kpi_reviews k
                 where k.period_id = p.id and k.employee_id = v_uid and k.status = 'final'))
      from public.kpi_periods p where p.status = 'aktif'
      limit 1)
  );
end;
$$;

revoke all on function public.my_dashboard() from public, anon;
grant execute on function public.my_dashboard() to authenticated;
