-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 1: skema dasar
-- Tabel: divisions, positions, offices, shifts, holidays, profiles
-- Referensi: docs/PRD.md bagian 4, 7, 8
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------
create type public.user_role as enum ('employee', 'hr');
create type public.gender_type as enum ('laki_laki', 'perempuan');
create type public.employment_status as enum ('tetap', 'kontrak');

-- ---------------------------------------------------------------------
-- Fungsi trigger updated_at (dipakai semua tabel)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------
create table public.divisions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.positions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  division_id  uuid not null references public.divisions (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (division_id, name)
);
create index positions_division_id_idx on public.positions (division_id);

create table public.offices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  latitude    numeric(9, 6) not null check (latitude between -90 and 90),
  longitude   numeric(9, 6) not null check (longitude between -180 and 180),
  radius_m    integer not null default 100 check (radius_m >= 25),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.shifts (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique check (length(trim(name)) > 0),
  start_time          time not null,
  end_time            time not null,
  late_tolerance_min  integer not null default 15 check (late_tolerance_min >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_time > start_time)
);

create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profil karyawan (satu baris per akun auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nip                text unique check (nip ~ '^BRT-[0-9]{4}-[0-9]{4}$'),
  full_name          text not null check (length(trim(full_name)) > 0),
  email              text not null unique,
  phone              text,
  gender             public.gender_type,
  birth_date         date,
  photo_url          text,
  role               public.user_role not null default 'employee',
  division_id        uuid references public.divisions (id) on delete restrict,
  position_id        uuid references public.positions (id) on delete restrict,
  office_id          uuid references public.offices (id) on delete restrict,
  shift_id           uuid references public.shifts (id) on delete restrict,
  join_date          date,
  employment_status  public.employment_status,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_division_id_idx on public.profiles (division_id);
create index profiles_position_id_idx on public.profiles (position_id);
create index profiles_office_id_idx   on public.profiles (office_id);
create index profiles_shift_id_idx    on public.profiles (shift_id);
create index profiles_role_idx        on public.profiles (role);

-- ---------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on public.divisions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.positions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.offices
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.holidays
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- public.is_hr(): true jika user saat ini ber-role 'hr' dan aktif.
-- security definer supaya tidak terkena RLS profiles (hindari rekursi).
-- ---------------------------------------------------------------------
create or replace function public.is_hr()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'hr'
      and p.is_active
  );
$$;

revoke all on function public.is_hr() from public, anon;
grant execute on function public.is_hr() to authenticated;

-- ---------------------------------------------------------------------
-- Hak akses tabel: anon tidak dapat apa pun, authenticated tanpa DELETE.
-- RLS di bawah yang menentukan baris mana yang boleh.
-- ---------------------------------------------------------------------
revoke all on public.divisions, public.positions, public.offices,
              public.shifts, public.holidays, public.profiles
  from anon, authenticated;

grant select, insert, update on public.divisions, public.positions, public.offices,
                                public.shifts, public.holidays, public.profiles
  to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.divisions enable row level security;
alter table public.positions enable row level security;
alter table public.offices   enable row level security;
alter table public.shifts    enable row level security;
alter table public.holidays  enable row level security;
alter table public.profiles  enable row level security;

-- Master data: semua user login boleh baca, hanya HR boleh tulis.
create policy "divisions: user login baca" on public.divisions
  for select to authenticated using (true);
create policy "divisions: HR tambah" on public.divisions
  for insert to authenticated with check (public.is_hr());
create policy "divisions: HR ubah" on public.divisions
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "positions: user login baca" on public.positions
  for select to authenticated using (true);
create policy "positions: HR tambah" on public.positions
  for insert to authenticated with check (public.is_hr());
create policy "positions: HR ubah" on public.positions
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "offices: user login baca" on public.offices
  for select to authenticated using (true);
create policy "offices: HR tambah" on public.offices
  for insert to authenticated with check (public.is_hr());
create policy "offices: HR ubah" on public.offices
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "shifts: user login baca" on public.shifts
  for select to authenticated using (true);
create policy "shifts: HR tambah" on public.shifts
  for insert to authenticated with check (public.is_hr());
create policy "shifts: HR ubah" on public.shifts
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "holidays: user login baca" on public.holidays
  for select to authenticated using (true);
create policy "holidays: HR tambah" on public.holidays
  for insert to authenticated with check (public.is_hr());
create policy "holidays: HR ubah" on public.holidays
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

-- Profiles: karyawan hanya baca baris sendiri, HR baca/tambah/ubah semua.
create policy "profiles: baca milik sendiri" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: HR baca semua" on public.profiles
  for select to authenticated using (public.is_hr());
create policy "profiles: HR tambah" on public.profiles
  for insert to authenticated with check (public.is_hr());
create policy "profiles: HR ubah" on public.profiles
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

-- Tidak ada policy DELETE: client tidak bisa menghapus baris apa pun.
