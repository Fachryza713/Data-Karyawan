-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 7: Pengajuan cuti oleh karyawan
-- Tabel leave_types, leave_balances, requests; working_days; saldo kuota otomatis;
-- RPC submit_leave / cancel_request; bucket Storage privat "attachments".
-- Approval HR dikerjakan di migrasi terpisah.
-- Referensi: PRD US-08, bagian 6.3, bagian 7
-- =====================================================================

-- ---------------------------------------------------------------------
-- leave_types: master jenis cuti. Semua user login baca, HR tulis.
-- ---------------------------------------------------------------------
create table public.leave_types (
  id                               uuid primary key default gen_random_uuid(),
  code                             text not null unique check (code ~ '^[a-z_]+$'),
  name                             text not null check (length(trim(name)) > 0),
  annual_quota                     integer check (annual_quota >= 0),          -- null = tidak terbatas
  deducts_quota                    boolean not null default false,
  requires_attachment_after_days   integer check (requires_attachment_after_days >= 0), -- null = opsional
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);

insert into public.leave_types (code, name, annual_quota, deducts_quota, requires_attachment_after_days) values
  ('tahunan',     'Cuti tahunan', 12,   true,  null),
  ('sakit',       'Sakit',        null, false, 1),
  ('izin_khusus', 'Izin khusus',  null, false, null)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- leave_balances: kuota cuti tahunan per karyawan per tahun. Sisa = quota - used.
-- ---------------------------------------------------------------------
create table public.leave_balances (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  year         integer not null check (year between 2000 and 2100),
  quota        integer not null check (quota >= 0),
  used         integer not null default 0 check (used >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, year)
);

-- ---------------------------------------------------------------------
-- requests: satu tabel untuk cuti (kind = leave) dan izin kerja di luar kantor (wfh/dinas).
-- ---------------------------------------------------------------------
create table public.requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.profiles (id) on delete cascade,
  kind             text not null check (kind in ('leave', 'wfh', 'dinas')),
  leave_type_id    uuid references public.leave_types (id) on delete restrict,
  start_date       date not null,
  end_date         date not null,
  working_days     integer not null check (working_days >= 0),
  reason           text not null check (length(trim(reason)) > 0 and length(reason) <= 500),
  destination      text,
  attachment_path  text,
  status           text not null default 'menunggu'
                     check (status in ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date),
  check ((kind = 'leave') = (leave_type_id is not null))
);
create index requests_employee_start_idx on public.requests (employee_id, start_date);
create index requests_status_idx on public.requests (status);

create trigger set_updated_at before update on public.leave_types
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hak akses + RLS
-- leave_types: master (baca semua, tulis HR). leave_balances: HR kelola, karyawan baca miliknya.
-- requests: hanya SELECT dari client; penulisan lewat RPC.
-- ---------------------------------------------------------------------
revoke all on public.leave_types, public.leave_balances, public.requests from anon, authenticated;
grant select, insert, update on public.leave_types, public.leave_balances to authenticated;
grant select on public.requests to authenticated;

alter table public.leave_types    enable row level security;
alter table public.leave_balances enable row level security;
alter table public.requests       enable row level security;

create policy "leave_types: user login baca" on public.leave_types
  for select to authenticated using (true);
create policy "leave_types: HR tambah" on public.leave_types
  for insert to authenticated with check (public.is_hr());
create policy "leave_types: HR ubah" on public.leave_types
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "leave_balances: karyawan baca miliknya" on public.leave_balances
  for select to authenticated using (employee_id = auth.uid());
create policy "leave_balances: HR baca semua" on public.leave_balances
  for select to authenticated using (public.is_hr());
create policy "leave_balances: HR tambah" on public.leave_balances
  for insert to authenticated with check (public.is_hr());
create policy "leave_balances: HR ubah" on public.leave_balances
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "requests: karyawan baca miliknya" on public.requests
  for select to authenticated using (employee_id = auth.uid());
create policy "requests: HR baca semua" on public.requests
  for select to authenticated using (public.is_hr());

-- ---------------------------------------------------------------------
-- working_days: jumlah hari kerja (tanpa Sabtu, Minggu, dan tanggal di holidays), inklusif.
-- ---------------------------------------------------------------------
create or replace function public.working_days(p_start date, p_end date)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from generate_series(p_start::timestamp, p_end::timestamp, interval '1 day') as g(d)
  where extract(isodow from g.d) < 6
    and not exists (select 1 from public.holidays h where h.date = g.d::date);
$$;

revoke all on function public.working_days(date, date) from public, anon;
grant execute on function public.working_days(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Saldo kuota otomatis
-- ---------------------------------------------------------------------
create or replace function public.ensure_leave_balance(p_employee_id uuid, p_year integer)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.leave_balances (employee_id, year, quota)
  select p_employee_id, p_year, coalesce(lt.annual_quota, 0)
  from public.leave_types lt
  where lt.code = 'tahunan'
  on conflict (employee_id, year) do nothing;
$$;

-- Buat saldo tahun p_year (default tahun berjalan WIB) untuk semua karyawan aktif.
create or replace function public.create_leave_balances(p_year integer default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year  integer := coalesce(p_year, extract(year from now() at time zone 'Asia/Jakarta')::integer);
  v_count integer;
begin
  insert into public.leave_balances (employee_id, year, quota)
  select p.id, v_year, coalesce(lt.annual_quota, 0)
  from public.profiles p
  cross join public.leave_types lt
  where lt.code = 'tahunan' and p.is_active
  on conflict (employee_id, year) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.ensure_leave_balance(uuid, integer) from public, anon, authenticated;
revoke all on function public.create_leave_balances(integer) from public, anon, authenticated;

-- Karyawan baru: langsung dapat saldo tahun berjalan.
create or replace function public.profiles_create_leave_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    perform public.ensure_leave_balance(new.id, extract(year from now() at time zone 'Asia/Jakarta')::integer);
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_create_leave_balance() from public, anon, authenticated;

create trigger create_leave_balance after insert on public.profiles
  for each row execute function public.profiles_create_leave_balance();

-- Saldo untuk karyawan yang sudah ada.
select public.create_leave_balances();

-- pg_cron: 1 Januari 00:05 WIB = 31 Desember 17:05 UTC.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'create-leave-balances-yearly') then
    perform cron.unschedule('create-leave-balances-yearly');
  end if;
  perform cron.schedule('create-leave-balances-yearly', '5 17 31 12 *', 'select public.create_leave_balances();');
end;
$$;

-- ---------------------------------------------------------------------
-- Storage bucket "attachments": privat, JPG/PNG/PDF maks 2 MB (ditegakkan Storage).
-- Path wajib <user_id>/<uuid>.<ext>. Pemilik & HR baca, hanya pemilik upload.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 2097152, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "attachments: pemilik dan HR baca" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_hr())
  );

create policy "attachments: pemilik upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|pdf)$'
  );

-- ---------------------------------------------------------------------
-- submit_leave: ajukan cuti/sakit/izin khusus. p_type = leave_types.code.
-- ---------------------------------------------------------------------
create or replace function public.submit_leave(
  p_type text, p_start date, p_end date, p_reason text, p_attachment_path text default null
)
returns public.requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_today    date := (now() at time zone 'Asia/Jakarta')::date;
  v_type     public.leave_types;
  v_days     integer;
  v_reason   text := nullif(trim(coalesce(p_reason, '')), '');
  v_path     text := nullif(trim(coalesce(p_attachment_path, '')), '');
  v_year     integer;
  v_quota    integer;
  v_used     integer;
  v_pending  integer;
  v_row      public.requests;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'Akun tidak aktif.' using errcode = '42501';
  end if;

  select * into v_type from public.leave_types lt where lt.code = p_type;
  if not found then
    raise exception 'Jenis cuti tidak dikenal.' using errcode = '22023';
  end if;

  if p_start is null or p_end is null then
    raise exception 'Tanggal mulai dan selesai wajib diisi.' using errcode = '22023';
  end if;
  if p_start > p_end then
    raise exception 'Tanggal selesai tidak boleh sebelum tanggal mulai.' using errcode = '22023';
  end if;
  if p_start < v_today - 7 then
    raise exception 'Tanggal mulai paling lambat 7 hari ke belakang.' using errcode = '22023';
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

  v_days := public.working_days(p_start, p_end);
  if v_days = 0 then
    raise exception 'Rentang tanggal tidak berisi hari kerja.' using errcode = 'P0001';
  end if;

  -- Serialkan pengajuan per karyawan agar cek tumpang tindih & kuota tidak bisa diakali dengan klik ganda.
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

  if v_type.deducts_quota then
    if extract(year from p_start) <> extract(year from p_end) then
      raise exception 'Cuti tahunan tidak boleh melewati pergantian tahun. Ajukan terpisah per tahun.'
        using errcode = 'P0001';
    end if;
    v_year := extract(year from p_start)::integer;
    perform public.ensure_leave_balance(v_uid, v_year);
    select b.quota, b.used into v_quota, v_used
    from public.leave_balances b where b.employee_id = v_uid and b.year = v_year;

    -- Pengajuan yang masih menunggu ikut memesan kuota.
    select coalesce(sum(r.working_days), 0)::integer into v_pending
    from public.requests r
    where r.employee_id = v_uid and r.status = 'menunggu' and r.leave_type_id = v_type.id
      and extract(year from r.start_date) = v_year;

    if v_days > v_quota - v_used - v_pending then
      raise exception 'Sisa kuota cuti tahunan % tidak cukup: tersedia % hari kerja, diajukan % hari kerja.',
        v_year, greatest(v_quota - v_used - v_pending, 0), v_days
        using errcode = 'P0001';
    end if;
  end if;

  if v_type.requires_attachment_after_days is not null
     and v_days > v_type.requires_attachment_after_days and v_path is null then
    raise exception '% lebih dari % hari kerja wajib melampirkan surat dokter.',
      v_type.name, v_type.requires_attachment_after_days
      using errcode = 'P0001';
  end if;

  if v_path is not null then
    if v_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|pdf)$') then
      raise exception 'Lampiran tidak valid.' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'attachments' and o.name = v_path) then
      raise exception 'Lampiran tidak ditemukan. Unggah ulang file.' using errcode = '22023';
    end if;
  end if;

  insert into public.requests (employee_id, kind, leave_type_id, start_date, end_date, working_days, reason, attachment_path)
  values (v_uid, 'leave', v_type.id, p_start, p_end, v_days, v_reason, v_path)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_request: pemilik membatalkan pengajuan yang masih menunggu.
-- ---------------------------------------------------------------------
create or replace function public.cancel_request(p_id uuid)
returns public.requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_row  public.requests;
begin
  if v_uid is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;

  select * into v_row from public.requests r where r.id = p_id for update;
  if not found or v_row.employee_id <> v_uid then
    raise exception 'Pengajuan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'menunggu' then
    raise exception 'Pengajuan yang sudah % tidak bisa dibatalkan.', v_row.status using errcode = 'P0001';
  end if;

  update public.requests set status = 'dibatalkan' where id = p_id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.submit_leave(text, date, date, text, text) from public, anon;
revoke all on function public.cancel_request(uuid) from public, anon;
grant execute on function public.submit_leave(text, date, date, text, text) to authenticated;
grant execute on function public.cancel_request(uuid) to authenticated;
