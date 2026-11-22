-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 16: Notifikasi in-app
-- Tabel notifications + trigger pembuat notifikasi:
--   pengajuan baru            -> semua HR aktif (kecuali pengaju sendiri)
--   pengajuan disetujui/ditolak -> pengaju (dengan catatan HR)
--   payroll run menjadi final -> setiap karyawan yang punya slip di run itu
--   review KPI menjadi final  -> karyawan yang dinilai
-- Client hanya SELECT dan UPDATE kolom read_at miliknya; INSERT hanya lewat trigger
-- security definer. Tabel ikut publikasi supabase_realtime untuk badge & panel langsung.
-- Referensi: PRD US-21, bagian 7
-- =====================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (type in ('request_new', 'request_reviewed', 'payslip_published', 'kpi_final')),
  title       text not null check (length(trim(title)) between 1 and 200),
  body        text check (length(body) <= 1000),
  link        text check (link ~ '^/'),
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

create trigger set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hak akses + RLS. Notifikasi bersifat pribadi: setiap akun (termasuk HR) hanya melihat
-- dan menandai miliknya sendiri. Hanya kolom read_at yang boleh diubah client.
-- ---------------------------------------------------------------------
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter table public.notifications enable row level security;

create policy "notifications: baca miliknya" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: tandai dibaca miliknya" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Realtime: perubahan baris dikirim ke pemiliknya (Realtime memeriksa RLS SELECT di atas).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Format tanggal Bahasa Indonesia untuk teks notifikasi.
-- ---------------------------------------------------------------------
create or replace function public._id_date(p date)
returns text
language sql
immutable
set search_path = ''
as $$
  select extract(day from p)::integer || ' '
    || (array['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'])[extract(month from p)::integer]
    || ' ' || extract(year from p)::integer;
$$;

-- "24 Nov 2026" / "24–26 Nov 2026" / "30 Nov 2026 – 2 Des 2026"
create or replace function public._id_date_range(p_start date, p_end date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_start = p_end then public._id_date(p_start)
    when date_trunc('month', p_start) = date_trunc('month', p_end)
      then extract(day from p_start)::integer || '–' || public._id_date(p_end)
    else public._id_date(p_start) || ' – ' || public._id_date(p_end)
  end;
$$;

-- '2026-11' -> 'November 2026'
create or replace function public._id_period(p_period text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
                'September', 'Oktober', 'November', 'Desember'])[substr(p_period, 6, 2)::integer]
    || ' ' || substr(p_period, 1, 4);
$$;

-- Nama jenis pengajuan: nama jenis cuti, "WFH", atau "Dinas luar".
create or replace function public._request_label(p_kind text, p_leave_type_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'wfh' then 'WFH'
    when 'dinas' then 'Dinas luar'
    else coalesce((select lt.name from public.leave_types lt where lt.id = p_leave_type_id), 'Cuti')
  end;
$$;

revoke all on function public._id_date(date)              from public, anon, authenticated;
revoke all on function public._id_date_range(date, date)  from public, anon, authenticated;
revoke all on function public._id_period(text)            from public, anon, authenticated;
revoke all on function public._request_label(text, uuid)  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pengajuan baru (status menunggu) -> semua HR aktif selain pengaju.
-- ---------------------------------------------------------------------
create or replace function public._notify_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_label  text := public._request_label(new.kind, new.leave_type_id);
  v_body   text;
begin
  if new.status <> 'menunggu' then
    return null;
  end if;
  select p.full_name into v_name from public.profiles p where p.id = new.employee_id;

  v_body := public._id_date_range(new.start_date, new.end_date)
    || ' · ' || new.working_days || ' hari kerja'
    || coalesce(' · Tujuan: ' || nullif(trim(new.destination), ''), '')
    || ' · ' || left(new.reason, 160);

  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'request_new', format('%s mengajukan %s', v_name, v_label), v_body, '/hr/kehadiran'
  from public.profiles p
  where p.role = 'hr' and p.is_active and p.id <> new.employee_id;
  return null;
end;
$$;

create trigger notify_request_created
  after insert on public.requests
  for each row execute function public._notify_request_created();

-- ---------------------------------------------------------------------
-- Pengajuan disetujui/ditolak -> pengaju, beserta catatan HR.
-- ---------------------------------------------------------------------
create or replace function public._notify_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text;
  v_label  text := public._request_label(new.kind, new.leave_type_id);
begin
  select p.role::text into v_role from public.profiles p where p.id = new.employee_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.employee_id,
    'request_reviewed',
    format('Pengajuan %s %s', v_label, case when new.status = 'disetujui' then 'disetujui' else 'ditolak' end),
    public._id_date_range(new.start_date, new.end_date)
      || coalesce(' · Catatan HR: ' || nullif(trim(new.review_note), ''), ''),
    case when v_role = 'hr' then '/hr/kehadiran' else '/app/kehadiran' end
  );
  return null;
end;
$$;

create trigger notify_request_reviewed
  after update of status on public.requests
  for each row
  when (old.status = 'menunggu' and new.status in ('disetujui', 'ditolak'))
  execute function public._notify_request_reviewed();

-- ---------------------------------------------------------------------
-- Payroll draft -> final -> setiap karyawan yang punya slip di run itu.
-- Bila run pernah final lalu dibuka ulang, notifikasi berikutnya berbunyi "diperbarui".
-- ---------------------------------------------------------------------
create or replace function public._notify_payroll_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := public._id_period(new.period);
begin
  insert into public.notifications (user_id, type, title, body, link)
  select s.employee_id,
         'payslip_published',
         format('Slip gaji %s sudah %s', v_label,
           case when exists (
             select 1 from public.notifications n
             where n.user_id = s.employee_id and n.type = 'payslip_published'
               and n.link in ('/app/gaji?periode=' || new.period, '/hr/penggajian/' || new.period))
           then 'diperbarui' else 'terbit' end),
         'Lihat rincian penerimaan dan potongan di menu Gaji & Manfaat.',
         case when p.role = 'hr' then '/hr/penggajian/' || new.period else '/app/gaji?periode=' || new.period end
  from public.payslips s
  join public.profiles p on p.id = s.employee_id
  where s.run_id = new.id;
  return null;
end;
$$;

create trigger notify_payroll_final
  after update of status on public.payroll_runs
  for each row
  when (old.status = 'draft' and new.status = 'final')
  execute function public._notify_payroll_final();

-- ---------------------------------------------------------------------
-- Review KPI draft -> final -> karyawan yang dinilai.
-- ---------------------------------------------------------------------
create or replace function public._notify_kpi_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period  public.kpi_periods;
  v_role    text;
begin
  select * into v_period from public.kpi_periods where id = new.period_id;
  select p.role::text into v_role from public.profiles p where p.id = new.employee_id;

  insert into public.notifications (user_id, type, title, body, link)
  values (
    new.employee_id,
    'kpi_final',
    format('Hasil KPI %s sudah final', v_period.name),
    format('Skor akhir %s · Grade %s', replace(to_char(new.final_score, 'FM990.0'), '.', ','), new.grade),
    case when v_role = 'hr' then '/hr/kpi/penilaian/' || new.id
         else format('/app/kinerja?periode=%s-Q%s', v_period.year, v_period.quarter) end
  );
  return null;
end;
$$;

create trigger notify_kpi_final
  after update of status on public.kpi_reviews
  for each row
  when (old.status = 'draft' and new.status = 'final')
  execute function public._notify_kpi_final();

revoke all on function public._notify_request_created()  from public, anon, authenticated;
revoke all on function public._notify_request_reviewed() from public, anon, authenticated;
revoke all on function public._notify_payroll_final()    from public, anon, authenticated;
revoke all on function public._notify_kpi_final()        from public, anon, authenticated;
