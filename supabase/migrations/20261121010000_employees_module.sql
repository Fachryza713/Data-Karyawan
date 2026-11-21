-- =====================================================================
-- HRIS Blue Rose Tech — migrasi 2: modul Data karyawan
-- Tabel: salary_components, benefits, audit_logs
-- RPC: hr_create_employee, hr_change_salary
-- Referensi: docs/PRD.md US-10, US-11, bagian 7 dan 8
-- =====================================================================

-- ---------------------------------------------------------------------
-- Riwayat gaji. Perubahan gaji = baris baru (tidak ada UPDATE dari client).
-- Rekening hanya disimpan 4 digit terakhir.
-- ---------------------------------------------------------------------
create table public.salary_components (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.profiles (id) on delete cascade,
  base_salary         numeric(14, 0) not null check (base_salary >= 0),
  fixed_allowance     numeric(14, 0) not null default 0 check (fixed_allowance >= 0),
  bank_name           text not null check (length(trim(bank_name)) > 0),
  bank_account_last4  text not null check (bank_account_last4 ~ '^[0-9]{4}$'),
  bpjs_kes_no         text check (bpjs_kes_no ~ '^[0-9]{13}$'),
  bpjs_tk_no          text check (bpjs_tk_no ~ '^[0-9]{11}$'),
  effective_from      date not null,
  note                text,
  created_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index salary_components_employee_idx
  on public.salary_components (employee_id, effective_from desc, created_at desc);

-- ---------------------------------------------------------------------
-- Manfaat: BPJS dan asuransi swasta
-- ---------------------------------------------------------------------
create table public.benefits (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  provider     text not null check (length(trim(provider)) > 0),
  program      text,
  card_no      text,
  class        text,
  dependents   integer not null default 0 check (dependents >= 0),
  status       text not null default 'aktif' check (status in ('aktif', 'nonaktif')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index benefits_employee_idx on public.benefits (employee_id);

-- ---------------------------------------------------------------------
-- Audit log: hanya diisi trigger, hanya HR yang bisa membaca.
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null check (action in ('insert', 'update')),
  table_name  text not null,
  record_id   uuid,
  diff        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on public.salary_components
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.benefits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Jabatan harus milik divisi yang dipilih.
-- ---------------------------------------------------------------------
create or replace function public.check_profile_position_division()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position_id is not null and new.division_id is not null and not exists (
    select 1 from public.positions p
    where p.id = new.position_id and p.division_id = new.division_id
  ) then
    raise exception 'Jabatan tidak termasuk dalam divisi yang dipilih.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_position_division before insert or update of position_id, division_id on public.profiles
  for each row execute function public.check_profile_position_division();

-- ---------------------------------------------------------------------
-- Audit trigger: catat insert/update oleh HR.
-- Insert: seluruh baris. Update: hanya kolom yang berubah {kolom: {old, new}}.
-- ---------------------------------------------------------------------
create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new  jsonb := to_jsonb(new) - 'created_at' - 'updated_at';
  v_old  jsonb;
  v_diff jsonb;
begin
  if not public.is_hr() then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_diff := v_new;
  else
    v_old := to_jsonb(old) - 'created_at' - 'updated_at';
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value)), '{}'::jsonb)
      into v_diff
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key;
    if v_diff = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, (v_new ->> 'id')::uuid, v_diff);
  return null;
end;
$$;

revoke all on function public.log_audit() from public, anon, authenticated;

create trigger audit_profiles after insert or update on public.profiles
  for each row execute function public.log_audit();
create trigger audit_salary_components after insert or update on public.salary_components
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------
-- Hak akses tabel
-- ---------------------------------------------------------------------
revoke all on public.salary_components, public.benefits, public.audit_logs from anon, authenticated;
grant select, insert         on public.salary_components to authenticated;
grant select, insert, update on public.benefits          to authenticated;
grant select                 on public.audit_logs        to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.salary_components enable row level security;
alter table public.benefits          enable row level security;
alter table public.audit_logs        enable row level security;

create policy "salary_components: baca milik sendiri" on public.salary_components
  for select to authenticated using (employee_id = auth.uid());
create policy "salary_components: HR baca semua" on public.salary_components
  for select to authenticated using (public.is_hr());
create policy "salary_components: HR tambah" on public.salary_components
  for insert to authenticated with check (public.is_hr());

create policy "benefits: baca milik sendiri" on public.benefits
  for select to authenticated using (employee_id = auth.uid());
create policy "benefits: HR baca semua" on public.benefits
  for select to authenticated using (public.is_hr());
create policy "benefits: HR tambah" on public.benefits
  for insert to authenticated with check (public.is_hr());
create policy "benefits: HR ubah" on public.benefits
  for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy "audit_logs: HR baca" on public.audit_logs
  for select to authenticated using (public.is_hr());

-- ---------------------------------------------------------------------
-- RPC hr_create_employee: isi profiles + gaji awal + manfaat dalam satu transaksi.
-- Dipanggil Edge Function invite-employee dengan JWT HR (security invoker: RLS tetap berlaku,
-- auth.uid() = HR sehingga audit log mencatat pelakunya).
-- ---------------------------------------------------------------------
create or replace function public.hr_create_employee(p_user_id uuid, p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_join date := (p_data ->> 'join_date')::date;
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang boleh menambah karyawan.' using errcode = '42501';
  end if;

  insert into public.profiles (
    id, nip, full_name, email, gender, birth_date, role,
    division_id, position_id, office_id, shift_id, join_date, employment_status, is_active
  ) values (
    p_user_id,
    upper(trim(p_data ->> 'nip')),
    trim(p_data ->> 'full_name'),
    lower(trim(p_data ->> 'email')),
    (p_data ->> 'gender')::public.gender_type,
    nullif(p_data ->> 'birth_date', '')::date,
    'employee',
    (p_data ->> 'division_id')::uuid,
    (p_data ->> 'position_id')::uuid,
    (p_data ->> 'office_id')::uuid,
    (p_data ->> 'shift_id')::uuid,
    v_join,
    (p_data ->> 'employment_status')::public.employment_status,
    true
  );

  insert into public.salary_components (
    employee_id, base_salary, fixed_allowance, bank_name, bank_account_last4,
    bpjs_kes_no, bpjs_tk_no, effective_from, note
  ) values (
    p_user_id,
    (p_data ->> 'base_salary')::numeric,
    coalesce(nullif(p_data ->> 'fixed_allowance', '')::numeric, 0),
    trim(p_data ->> 'bank_name'),
    p_data ->> 'bank_account_last4',
    nullif(p_data ->> 'bpjs_kes_no', ''),
    nullif(p_data ->> 'bpjs_tk_no', ''),
    v_join,
    'Gaji awal'
  );

  insert into public.benefits (employee_id, provider, program, card_no, class, status) values
    (p_user_id, 'BPJS Kesehatan', 'JKN', nullif(p_data ->> 'bpjs_kes_no', ''), 'Kelas 1', 'aktif'),
    (p_user_id, 'BPJS Ketenagakerjaan', 'JHT, JKK, JKM, JP', nullif(p_data ->> 'bpjs_tk_no', ''), null, 'aktif');

  return p_user_id;
end;
$$;

revoke all on function public.hr_create_employee(uuid, jsonb) from public, anon;
grant execute on function public.hr_create_employee(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- RPC hr_change_salary: tambah baris riwayat gaji baru dan sinkronkan nomor kartu BPJS.
-- ---------------------------------------------------------------------
create or replace function public.hr_change_salary(p_employee_id uuid, p_data jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_kes text := nullif(p_data ->> 'bpjs_kes_no', '');
  v_tk  text := nullif(p_data ->> 'bpjs_tk_no', '');
begin
  if not public.is_hr() then
    raise exception 'Hanya HR yang boleh mengubah gaji.' using errcode = '42501';
  end if;

  insert into public.salary_components (
    employee_id, base_salary, fixed_allowance, bank_name, bank_account_last4,
    bpjs_kes_no, bpjs_tk_no, effective_from, note
  ) values (
    p_employee_id,
    (p_data ->> 'base_salary')::numeric,
    coalesce(nullif(p_data ->> 'fixed_allowance', '')::numeric, 0),
    trim(p_data ->> 'bank_name'),
    p_data ->> 'bank_account_last4',
    v_kes,
    v_tk,
    (p_data ->> 'effective_from')::date,
    nullif(trim(p_data ->> 'note'), '')
  )
  returning id into v_id;

  update public.benefits set card_no = v_kes
   where employee_id = p_employee_id and provider = 'BPJS Kesehatan' and card_no is distinct from v_kes;
  update public.benefits set card_no = v_tk
   where employee_id = p_employee_id and provider = 'BPJS Ketenagakerjaan' and card_no is distinct from v_tk;

  return v_id;
end;
$$;

revoke all on function public.hr_change_salary(uuid, jsonb) from public, anon;
grant execute on function public.hr_change_salary(uuid, jsonb) to authenticated;
