-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 12: Template KPI per jabatan & periode penilaian
-- Tabel kpi_templates, kpi_indicators, kpi_periods + template_is_valid.
-- RPC (khusus HR): hr_kpi_positions, hr_save_kpi_template, hr_create_kpi_period,
--   hr_set_kpi_period_deadline, hr_activate_kpi_period, hr_close_kpi_period.
-- Client hanya SELECT; semua penulisan lewat RPC security definer.
-- Penilaian (kpi_reviews, kpi_scores) dikerjakan di migrasi berikutnya.
-- Referensi: PRD US-16, bagian 6.5, bagian 7
-- =====================================================================

-- ---------------------------------------------------------------------
-- kpi_templates: satu template aktif per jabatan.
-- ---------------------------------------------------------------------
create table public.kpi_templates (
  id           uuid primary key default gen_random_uuid(),
  position_id  uuid not null references public.positions (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index kpi_templates_one_active_per_position
  on public.kpi_templates (position_id) where is_active;

-- ---------------------------------------------------------------------
-- kpi_indicators: bobot dalam persen (bilangan bulat 1–100), urut sort_order.
-- ---------------------------------------------------------------------
create table public.kpi_indicators (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.kpi_templates (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  description  text check (length(description) <= 500),
  weight       integer not null check (weight between 1 and 100),
  target       text check (length(target) <= 120),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index kpi_indicators_template_idx on public.kpi_indicators (template_id, sort_order);

-- ---------------------------------------------------------------------
-- kpi_periods: per kuartal. draft -> aktif -> selesai. Hanya satu yang aktif.
-- ---------------------------------------------------------------------
create table public.kpi_periods (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  year          integer not null check (year between 2000 and 2100),
  quarter       integer not null check (quarter between 1 and 4),
  start_date    date not null,
  end_date      date not null,
  deadline      date not null,
  status        text not null default 'draft' check (status in ('draft', 'aktif', 'selesai')),
  created_by    uuid references public.profiles (id) on delete set null,
  activated_by  uuid references public.profiles (id) on delete set null,
  activated_at  timestamptz,
  closed_by     uuid references public.profiles (id) on delete set null,
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (year, quarter),
  check (end_date >= start_date),
  check (deadline >= start_date)
);
create unique index kpi_periods_one_active on public.kpi_periods ((status)) where status = 'aktif';

create trigger set_updated_at before update on public.kpi_templates
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.kpi_indicators
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.kpi_periods
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Hak akses + RLS
-- HR baca semua. Karyawan: template & indikator jabatannya sendiri, periode aktif/selesai.
-- ---------------------------------------------------------------------
revoke all on public.kpi_templates, public.kpi_indicators, public.kpi_periods from anon, authenticated;
grant select on public.kpi_templates, public.kpi_indicators, public.kpi_periods to authenticated;

alter table public.kpi_templates  enable row level security;
alter table public.kpi_indicators enable row level security;
alter table public.kpi_periods    enable row level security;

create policy "kpi_templates: HR baca semua" on public.kpi_templates
  for select to authenticated using (public.is_hr());
create policy "kpi_templates: karyawan baca jabatannya" on public.kpi_templates
  for select to authenticated using (
    position_id = (select p.position_id from public.profiles p where p.id = auth.uid())
  );

create policy "kpi_indicators: HR baca semua" on public.kpi_indicators
  for select to authenticated using (public.is_hr());
create policy "kpi_indicators: karyawan baca jabatannya" on public.kpi_indicators
  for select to authenticated using (
    exists (
      select 1 from public.kpi_templates t
      where t.id = kpi_indicators.template_id
        and t.position_id = (select p.position_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy "kpi_periods: HR baca semua" on public.kpi_periods
  for select to authenticated using (public.is_hr());
create policy "kpi_periods: karyawan baca aktif dan selesai" on public.kpi_periods
  for select to authenticated using (status in ('aktif', 'selesai'));

-- ---------------------------------------------------------------------
-- template_is_valid: punya minimal satu indikator dan total bobot tepat 100.
-- Security invoker: karyawan hanya bisa mengecek template yang boleh ia baca.
-- ---------------------------------------------------------------------
create or replace function public.template_is_valid(p_template_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select count(*) > 0 and sum(i.weight) = 100
     from public.kpi_indicators i where i.template_id = p_template_id),
    false
  );
$$;

revoke all on function public.template_is_valid(uuid) from public, anon;
grant execute on function public.template_is_valid(uuid) to authenticated;

-- Pemeriksaan HR bersama untuk RPC KPI.
create or replace function public._kpi_require_hr()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak valid. Silakan login ulang.' using errcode = '42501';
  end if;
  if not public.is_hr() then
    raise exception 'Hanya HR yang dapat mengelola KPI.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke all on function public._kpi_require_hr() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- hr_kpi_positions: semua jabatan + jumlah karyawan aktif + status template aktifnya.
-- ---------------------------------------------------------------------
create or replace function public.hr_kpi_positions()
returns table (
  position_id       uuid,
  position_name     text,
  division_name     text,
  active_employees  integer,
  template_id       uuid,
  template_name     text,
  indicator_count   integer,
  total_weight      integer,
  is_valid          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public._kpi_require_hr();
  return query
  select
    ps.id, ps.name, d.name,
    (select count(*)::integer from public.profiles p where p.position_id = ps.id and p.is_active),
    t.id, t.name,
    coalesce(agg.n, 0)::integer,
    coalesce(agg.w, 0)::integer,
    coalesce(t.id is not null and agg.n > 0 and agg.w = 100, false)
  from public.positions ps
  left join public.divisions d on d.id = ps.division_id
  left join public.kpi_templates t on t.position_id = ps.id and t.is_active
  left join lateral (
    select count(*) as n, sum(i.weight) as w from public.kpi_indicators i where i.template_id = t.id
  ) agg on true
  order by d.name, ps.name;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_save_kpi_template: simpan template aktif sebuah jabatan beserta seluruh indikatornya
-- dalam satu transaksi. p_indicators = [{id?, name, description?, weight, target?}, ...]
-- berurutan sesuai tampilan. Indikator dengan id lama diperbarui (id tetap), tanpa id
-- ditambahkan, dan yang tidak ada di payload dihapus. Total bobot boleh belum 100 (draft);
-- template_is_valid menentukan apakah template bisa dipakai.
-- Hasil: {"template_id", "total_weight", "is_valid"}
-- ---------------------------------------------------------------------
create or replace function public.hr_save_kpi_template(p_position_id uuid, p_name text, p_indicators jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := public._kpi_require_hr();
  v_name      text := nullif(trim(coalesce(p_name, '')), '');
  v_template  public.kpi_templates;
  v_item      jsonb;
  v_ord       integer := 0;
  v_id        uuid;
  v_iname     text;
  v_desc      text;
  v_target    text;
  v_weight    integer;
  v_keep      uuid[] := '{}';
  v_names     text[] := '{}';
  v_total     integer;
  v_count     integer;
  v_old_total integer;
  v_old_count integer;
begin
  if not exists (select 1 from public.positions where id = p_position_id) then
    raise exception 'Jabatan tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'Nama template wajib diisi (maksimal 120 karakter).' using errcode = '22023';
  end if;
  if p_indicators is null or jsonb_typeof(p_indicators) <> 'array' or jsonb_array_length(p_indicators) = 0 then
    raise exception 'Template harus berisi minimal satu indikator.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_indicators) > 20 then
    raise exception 'Template maksimal 20 indikator.' using errcode = '22023';
  end if;

  -- Serialkan penyimpanan per jabatan.
  perform pg_advisory_xact_lock(hashtextextended('kpi_template:' || p_position_id::text, 0));

  select * into v_template from public.kpi_templates
  where position_id = p_position_id and is_active
  for update;

  if found then
    select count(*), coalesce(sum(weight), 0) into v_old_count, v_old_total
    from public.kpi_indicators where template_id = v_template.id;
    update public.kpi_templates set name = v_name where id = v_template.id returning * into v_template;
  else
    v_old_count := 0;
    v_old_total := 0;
    insert into public.kpi_templates (position_id, name) values (p_position_id, v_name)
    returning * into v_template;
  end if;

  -- Validasi semua item dulu, baru tulis.
  for v_item in select * from jsonb_array_elements(p_indicators) loop
    v_ord    := v_ord + 1;
    v_iname  := nullif(trim(coalesce(v_item ->> 'name', '')), '');
    v_desc   := nullif(trim(coalesce(v_item ->> 'description', '')), '');
    v_target := nullif(trim(coalesce(v_item ->> 'target', '')), '');

    if v_iname is null or length(v_iname) > 120 then
      raise exception 'Indikator ke-%: nama wajib diisi (maksimal 120 karakter).', v_ord using errcode = '22023';
    end if;
    if lower(v_iname) = any (v_names) then
      raise exception 'Indikator "%" tercantum lebih dari sekali.', v_iname using errcode = '22023';
    end if;
    v_names := v_names || lower(v_iname);
    if length(v_desc) > 500 then
      raise exception 'Indikator "%": deskripsi maksimal 500 karakter.', v_iname using errcode = '22023';
    end if;
    if length(v_target) > 120 then
      raise exception 'Indikator "%": target maksimal 120 karakter.', v_iname using errcode = '22023';
    end if;
    if coalesce(v_item ->> 'weight', '') !~ '^[0-9]{1,3}$' then
      raise exception 'Indikator "%": bobot harus bilangan bulat 1–100.', v_iname using errcode = '22023';
    end if;
    v_weight := (v_item ->> 'weight')::integer;
    if v_weight not between 1 and 100 then
      raise exception 'Indikator "%": bobot harus bilangan bulat 1–100.', v_iname using errcode = '22023';
    end if;
  end loop;

  v_ord := 0;
  for v_item in select * from jsonb_array_elements(p_indicators) loop
    v_ord    := v_ord + 1;
    v_iname  := trim(v_item ->> 'name');
    v_desc   := nullif(trim(coalesce(v_item ->> 'description', '')), '');
    v_target := nullif(trim(coalesce(v_item ->> 'target', '')), '');
    v_weight := (v_item ->> 'weight')::integer;
    v_id     := null;

    if coalesce(v_item ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
      update public.kpi_indicators set
        name = v_iname, description = v_desc, weight = v_weight, target = v_target, sort_order = v_ord
      where id = (v_item ->> 'id')::uuid and template_id = v_template.id
      returning id into v_id;
    end if;

    if v_id is null then
      insert into public.kpi_indicators (template_id, name, description, weight, target, sort_order)
      values (v_template.id, v_iname, v_desc, v_weight, v_target, v_ord)
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.kpi_indicators
  where template_id = v_template.id and not (id = any (v_keep));

  select count(*), coalesce(sum(weight), 0) into v_count, v_total
  from public.kpi_indicators where template_id = v_template.id;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, case when v_old_count = 0 then 'insert' else 'update' end, 'kpi_templates', v_template.id,
    jsonb_build_object(
      'position_id', p_position_id, 'name', v_name,
      'indicators', jsonb_build_object('old', v_old_count, 'new', v_count),
      'total_weight', jsonb_build_object('old', v_old_total, 'new', v_total)));

  return jsonb_build_object('template_id', v_template.id, 'total_weight', v_total,
    'is_valid', public.template_is_valid(v_template.id));
end;
$$;

-- ---------------------------------------------------------------------
-- hr_create_kpi_period: periode kuartal baru (draft). Nama "Q<n> <tahun>".
-- ---------------------------------------------------------------------
create or replace function public.hr_create_kpi_period(p_year integer, p_quarter integer, p_deadline date)
returns public.kpi_periods
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := public._kpi_require_hr();
  v_start  date;
  v_end    date;
  v_row    public.kpi_periods;
begin
  if p_year is null or p_year not between 2000 and 2100 then
    raise exception 'Tahun tidak valid.' using errcode = '22023';
  end if;
  if p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'Kuartal harus 1 sampai 4.' using errcode = '22023';
  end if;

  v_start := make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  v_end   := (v_start + interval '3 months' - interval '1 day')::date;

  if p_deadline is null then
    raise exception 'Tenggat wajib diisi.' using errcode = '22023';
  end if;
  if p_deadline < v_start then
    raise exception 'Tenggat tidak boleh sebelum awal periode (%).', to_char(v_start, 'DD-MM-YYYY') using errcode = '22023';
  end if;

  begin
    insert into public.kpi_periods (name, year, quarter, start_date, end_date, deadline, created_by)
    values (format('Q%s %s', p_quarter, p_year), p_year, p_quarter, v_start, v_end, p_deadline, v_uid)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Periode Q% % sudah ada.', p_quarter, p_year using errcode = 'P0001';
  end;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'insert', 'kpi_periods', v_row.id,
    jsonb_build_object('name', v_row.name, 'deadline', p_deadline, 'status', 'draft'));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_set_kpi_period_deadline: ubah tenggat periode draft/aktif.
-- ---------------------------------------------------------------------
create or replace function public.hr_set_kpi_period_deadline(p_id uuid, p_deadline date)
returns public.kpi_periods
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public._kpi_require_hr();
  v_old  public.kpi_periods;
  v_row  public.kpi_periods;
begin
  select * into v_old from public.kpi_periods where id = p_id for update;
  if not found then
    raise exception 'Periode tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_old.status = 'selesai' then
    raise exception 'Periode yang sudah selesai tidak bisa diubah.' using errcode = 'P0001';
  end if;
  if p_deadline is null or p_deadline < v_old.start_date then
    raise exception 'Tenggat tidak boleh sebelum awal periode (%).', to_char(v_old.start_date, 'DD-MM-YYYY') using errcode = '22023';
  end if;

  update public.kpi_periods set deadline = p_deadline where id = p_id returning * into v_row;

  if v_old.deadline is distinct from p_deadline then
    insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
    values (v_uid, 'update', 'kpi_periods', p_id,
      jsonb_build_object('name', v_old.name, 'deadline', jsonb_build_object('old', v_old.deadline, 'new', p_deadline)));
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_activate_kpi_period: draft -> aktif. Hanya satu periode aktif, dan setiap jabatan
-- yang punya karyawan aktif wajib punya template valid (template_is_valid).
-- ---------------------------------------------------------------------
create or replace function public.hr_activate_kpi_period(p_id uuid)
returns public.kpi_periods
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := public._kpi_require_hr();
  v_period   public.kpi_periods;
  v_active   text;
  v_missing  text;
  v_row      public.kpi_periods;
begin
  -- Serialkan aktivasi agar dua periode tidak aktif bersamaan.
  perform pg_advisory_xact_lock(hashtextextended('kpi_periods:activate', 0));

  select * into v_period from public.kpi_periods where id = p_id for update;
  if not found then
    raise exception 'Periode tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_period.status <> 'draft' then
    raise exception 'Hanya periode berstatus draft yang bisa diaktifkan.' using errcode = 'P0001';
  end if;

  select name into v_active from public.kpi_periods where status = 'aktif' and id <> p_id limit 1;
  if v_active is not null then
    raise exception 'Periode % masih aktif. Tutup periode itu terlebih dahulu.', v_active using errcode = 'P0001';
  end if;

  select string_agg(ps.name, ', ' order by ps.name) into v_missing
  from public.positions ps
  where exists (select 1 from public.profiles p where p.position_id = ps.id and p.is_active)
    and not coalesce((
      select public.template_is_valid(t.id) from public.kpi_templates t
      where t.position_id = ps.id and t.is_active
    ), false);
  if v_missing is not null then
    raise exception 'Periode belum bisa diaktifkan. Jabatan berikut belum punya template KPI valid (total bobot 100%%): %.', v_missing
      using errcode = 'P0001';
  end if;

  update public.kpi_periods set status = 'aktif', activated_by = v_uid, activated_at = now()
  where id = p_id returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'kpi_periods', p_id,
    jsonb_build_object('name', v_period.name, 'status', jsonb_build_object('old', 'draft', 'new', 'aktif')));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- hr_close_kpi_period: aktif -> selesai.
-- ---------------------------------------------------------------------
create or replace function public.hr_close_kpi_period(p_id uuid)
returns public.kpi_periods
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := public._kpi_require_hr();
  v_period  public.kpi_periods;
  v_row     public.kpi_periods;
begin
  select * into v_period from public.kpi_periods where id = p_id for update;
  if not found then
    raise exception 'Periode tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_period.status <> 'aktif' then
    raise exception 'Hanya periode aktif yang bisa ditutup.' using errcode = 'P0001';
  end if;

  update public.kpi_periods set status = 'selesai', closed_by = v_uid, closed_at = now()
  where id = p_id returning * into v_row;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (v_uid, 'update', 'kpi_periods', p_id,
    jsonb_build_object('name', v_period.name, 'status', jsonb_build_object('old', 'aktif', 'new', 'selesai')));
  return v_row;
end;
$$;

revoke all on function public.hr_kpi_positions()                                from public, anon;
revoke all on function public.hr_save_kpi_template(uuid, text, jsonb)           from public, anon;
revoke all on function public.hr_create_kpi_period(integer, integer, date)       from public, anon;
revoke all on function public.hr_set_kpi_period_deadline(uuid, date)             from public, anon;
revoke all on function public.hr_activate_kpi_period(uuid)                       from public, anon;
revoke all on function public.hr_close_kpi_period(uuid)                          from public, anon;
grant execute on function public.hr_kpi_positions()                             to authenticated;
grant execute on function public.hr_save_kpi_template(uuid, text, jsonb)        to authenticated;
grant execute on function public.hr_create_kpi_period(integer, integer, date)    to authenticated;
grant execute on function public.hr_set_kpi_period_deadline(uuid, date)          to authenticated;
grant execute on function public.hr_activate_kpi_period(uuid)                    to authenticated;
grant execute on function public.hr_close_kpi_period(uuid)                       to authenticated;

-- ---------------------------------------------------------------------
-- Seed contoh: 3 template (bobot total 100) + periode Q1 2026 (draft).
-- Dibungkus fungsi agar bisa dipanggil ulang dari seed.sql setelah master jabatan ada
-- (pada `db reset`, migrasi berjalan sebelum seed.sql). Aman dijalankan berulang.
-- ---------------------------------------------------------------------
create or replace function public._seed_kpi_examples()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pos  record;
  v_tid  uuid;
begin
  for v_pos in
    select ps.id, ps.name from public.positions ps
    where ps.name in ('Frontend Developer', 'HR Generalist', 'Sales Executive')
      and not exists (select 1 from public.kpi_templates t where t.position_id = ps.id and t.is_active)
  loop
    insert into public.kpi_templates (position_id, name)
    values (v_pos.id, 'KPI ' || v_pos.name)
    returning id into v_tid;

    insert into public.kpi_indicators (template_id, name, description, weight, target, sort_order)
    select v_tid, i.name, i.description, i.weight, i.target, i.ord
    from (values
      ('Frontend Developer', 1, 'Penyelesaian sprint', 'Persentase story point yang selesai sesuai komitmen sprint.', 30, '≥ 90% story point'),
      ('Frontend Developer', 2, 'Kualitas kode', 'Jumlah bug kritis yang lolos ke production selama kuartal.', 25, '≤ 2 bug kritis'),
      ('Frontend Developer', 3, 'Performa aplikasi', 'Skor Lighthouse performa untuk halaman utama.', 15, 'Skor ≥ 85'),
      ('Frontend Developer', 4, 'Code review', 'Pull request rekan yang direview dalam 1 hari kerja.', 15, '≥ 90% PR'),
      ('Frontend Developer', 5, 'Kolaborasi & dokumentasi', 'Dokumentasi komponen dan keterlibatan dalam diskusi tim.', 15, 'Nilai rekan ≥ 4 dari 5'),
      ('HR Generalist', 1, 'Waktu rekrutmen', 'Rata-rata hari dari lowongan dibuka sampai kandidat menerima tawaran.', 25, '≤ 30 hari'),
      ('HR Generalist', 2, 'Akurasi payroll', 'Slip gaji yang tidak perlu dikoreksi setelah final.', 25, '100% slip'),
      ('HR Generalist', 3, 'Kecepatan administrasi', 'Pengajuan cuti dan izin diproses dalam 1 hari kerja.', 20, '≥ 95% pengajuan'),
      ('HR Generalist', 4, 'Onboarding karyawan baru', 'Karyawan baru menyelesaikan onboarding di minggu pertama.', 15, '100% karyawan baru'),
      ('HR Generalist', 5, 'Kepuasan layanan HR', 'Skor survei kepuasan karyawan terhadap layanan HR.', 15, 'Skor ≥ 4 dari 5'),
      ('Sales Executive', 1, 'Pencapaian target penjualan', 'Nilai penjualan dibanding target kuartal.', 40, '≥ 100% target'),
      ('Sales Executive', 2, 'Akuisisi klien baru', 'Jumlah klien baru yang menandatangani kontrak.', 25, '≥ 5 klien'),
      ('Sales Executive', 3, 'Pipeline & kunjungan', 'Jumlah meeting prospek yang tercatat di CRM.', 20, '≥ 36 meeting'),
      ('Sales Executive', 4, 'Ketepatan laporan', 'Laporan penjualan mingguan dikirim tepat waktu.', 15, '100% minggu')
    ) as i(position_name, ord, name, description, weight, target)
    where i.position_name = v_pos.name;
  end loop;

  insert into public.kpi_periods (name, year, quarter, start_date, end_date, deadline)
  values ('Q1 2026', 2026, 1, '2026-01-01', '2026-03-31', '2026-03-31')
  on conflict do nothing;
end;
$$;

revoke all on function public._seed_kpi_examples() from public, anon, authenticated;

select public._seed_kpi_examples();
